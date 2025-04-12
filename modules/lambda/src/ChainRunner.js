// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

import { BaseCallbackHandler } from "@langchain/core/callbacks/base"
import { pipeline, Readable } from "stream"
import { promisify } from "util"

// This function overrides BaseCallbackHandler and registers itself as a callback when invoking the chain
// With that, it listens to events when a chain starts/ends and when an LLM generates a new token
// Learn more about callbacks in https://js.langchain.com/docs/modules/callbacks
// We're using Response streaming feature from Lambda
// If llmNamesToListen is not empty, we'll send (stream) partial responses based on those events
// If llmNamesToListen is empty, we'll send the full response at once as if streaming was not being used
export class ChainRunner extends BaseCallbackHandler {
  static #MIN_MILLISECONDS_BETWEEN_PUSHES = 80

  name = "ChainRunner" // Needed because Langchain doesn't call nameless callbacks

  #chain
  #readableStream
  #responseStream
  #chainNamesToListen
  #llmNamesToListen
  #llmRunIdsToListen
  #lastPush
  #contentToPush
  #pushingPromises

  constructor(chain, responseStream, chainNamesToListen, llmNamesToListen) {
    super()

    this.#chain = chain
    this.#responseStream = responseStream
    this.#chainNamesToListen = new Set(chainNamesToListen)
    this.#llmNamesToListen = new Set(llmNamesToListen)
    this.#llmRunIdsToListen = new Set()
    this.#lastPush = Date.now()
    this.#contentToPush = {}
    this.#pushingPromises = []

    class ReadableStream extends Readable {
      _read(_size) {}
    }
    this.#readableStream = new ReadableStream()
  }

  static #extendContentObj(obj1, obj2) {
    for (const key in obj2) {
      if (obj2.hasOwnProperty(key)) {
        if (key in obj1) {
          if (typeof obj1[key] === "string") {
            obj1[key] = obj1[key] + obj2[key]
          } else {
            obj1[key] = obj1[key].concat(obj2[key])
          }
        } else {
          obj1[key] = obj2[key]
        }
      }
    }
  }

  #pushContent(content) {
    ChainRunner.#extendContentObj(this.#contentToPush, content)
    const differenceSinceLastPushToReadableStream = Date.now() - this.#lastPush
    if (differenceSinceLastPushToReadableStream >= ChainRunner.#MIN_MILLISECONDS_BETWEEN_PUSHES) {
      this.#pushContentToReadableStream()
    } else {
      const timeLeftToPush = ChainRunner.#MIN_MILLISECONDS_BETWEEN_PUSHES - differenceSinceLastPushToReadableStream
      console.debug(`Too fast! Waiting ${timeLeftToPush} milliseconds before pushing content into stream`)
      this.#pushingPromises.push(new Promise(
        (resolve) => {
          setTimeout(() => {
            this.#pushContentToReadableStream()
            resolve()
          }, timeLeftToPush)
        }
      ))
    }
  }

  #pushContentToReadableStream() {
    if (Object.getOwnPropertyNames(this.#contentToPush).length === 0) {
      // Object is empty. Nothing to push
      return
    }
    const contentStr = JSON.stringify(this.#contentToPush)
    console.debug(`Pushing content into stream: ${contentStr}`)
    this.#readableStream.push(contentStr)
    this.#contentToPush = {}
    this.#lastPush = Date.now()
  }

  // We create a ReadableStream to push content into it
  // The content from ReadableStream is piped to a writable stream (responseStream), which is the Lambda output
  // We don't write directly into the responseStream to ensure it is not overwhelmed
  // Learn more in https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html
  async run(question) {
    console.info("Start running chain")
    console.debug(`Chain names to listen: ${Array.from(this.#chainNamesToListen)}`)
    console.debug(`LLM names to listen: ${Array.from(this.#llmNamesToListen)}`)
    console.log('Readable stream:', this.#readableStream);
   console.log('Response stream:', this.#responseStream);
    const pipelinePromise = promisify(pipeline)(this.#readableStream, this.#responseStream)
    const result = await this.#chain.getRunnable().stream({ question: question }, { callbacks: [this] })
    const uniqueSources = new Set()
    let completeAnswer = "";
    if (this.#llmNamesToListen.size) { // Stream on. We've sent partial responses and now we just need to send the last part
      let sources;
      for await (const chunk of result) {
        if (chunk.hasOwnProperty("docs")){
          sources = chunk.docs;
        } else{
          completeAnswer +=chunk.answer;
        }
      }
      const fullResponse = {
        sources: sources
      }
      this.#pushContent(fullResponse);
    } else { // Stream mode off. Send full response at once
      const fullResponse = {
        answer: result.answer,
        sources: sources
      }
      this.#pushContent(fullResponse)
    }

    await this.#chain.saveHistory(question, completeAnswer);

    console.debug("Ending chain")
    await Promise.all(this.#pushingPromises) // Wait for content that is pending to be pushed
    this.#readableStream.push(null) // Every content has been pushed. Push null to indicate the end
    return pipelinePromise
  }

  // BaseCallbackHandler overrides
  handleLLMStart(_llm, _prompts, runId, _parentRunId, _extraParams, _tags, _metadata, name) {
    console.debug(`LLM start handler. LLM name: ${name}. Run id: ${runId}`)
    if (this.#llmNamesToListen.has(name)) {
      console.debug(`Adding run id ${runId} to listen set`)
      this.#llmRunIdsToListen.add(runId)
    }
  }
  handleLLMEnd(_output, runId, _parentRunId, _tags) {
    console.debug(`LLM end handler. Run id: ${runId}`)
    if (this.#llmRunIdsToListen.has(runId)) {
      console.debug(`Remove run id ${runId} from listen set`)
      this.#llmRunIdsToListen.delete(runId)
    }
  }
  handleLLMNewToken(token, _idx, runId, _parentRunId, _tags, _fields) {
    console.debug(`LLM new token handler. Run id: ${runId}. Token: ${token}`)
    if (this.#llmRunIdsToListen.has(runId)) {
      this.#pushContent({
        answer: token
      })
    }
  }
  handleChainStart(_chain, _inputs, runId, _parentRunId, _tags, _metadata, _runType, name) {
    console.debug(`Chain start handler. Chain name: ${name}`)
    if (this.#chainNamesToListen.has(name)) {
      this.#pushContent({
        steps: [name]
      })
    }
  }
}
