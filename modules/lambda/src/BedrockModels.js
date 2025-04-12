// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

import { BedrockChat } from "@langchain/community/chat_models/bedrock";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

export class BedrockModels {
  // static CONDENSE_LLM_RUN_NAME = "Condense LLM"
  static CONDENSE_LLM_RUN_NAME = "Condense LLM"
  static SELF_QUERY_LLM_RUN_NAME = "Self-query LLM"
  static CHAT_LLM_RUN_NAME = "Chat LLM"

  static #CONDENSE_MODEL_TEMPERATURE = 0.0
  static #CONDENSE_MODEL_MAX_TOKENS = 200
  static #CONDENSE_MODEL_TOP_P = 0.9

  static #SELF_QUERY_MODEL_TEMPERATURE = 0.0
  static #SELF_QUERY_MODEL_MAX_TOKENS = 512
  static #SELF_QUERY_MODEL_TOP_P = 0.9

  static #CHAT_MODEL_TEMPERATURE = 0.2
  static #CHAT_MODEL_MAX_TOKENS = 1024
  static #CHAT_MODEL_TOP_P = 0.9
  
  #selfQueryModel;
  #chatModel;
  #condenseModel;
  #bedrockClient;

  constructor(selfQueryModelId, chatModelId, condenseModelId, region) {
    this.#bedrockClient = new BedrockRuntimeClient({ region: region });
    
    this.#selfQueryModel = BedrockModels.#BedrockWithDebugListeners({
      model: selfQueryModelId,
      region: region,
      temperature: BedrockModels.#SELF_QUERY_MODEL_TEMPERATURE,
      maxTokens: BedrockModels.#SELF_QUERY_MODEL_MAX_TOKENS,
      topP: BedrockModels.#SELF_QUERY_MODEL_TOP_P,
      client: this.#bedrockClient,
    }, BedrockModels.SELF_QUERY_LLM_RUN_NAME)
    
    this.#condenseModel = BedrockModels.#BedrockWithDebugListeners({
      model: condenseModelId,
      region: region,
      temperature: BedrockModels.#CONDENSE_MODEL_TEMPERATURE,
      maxTokens: BedrockModels.#CONDENSE_MODEL_MAX_TOKENS,
      topP: BedrockModels.#CONDENSE_MODEL_TOP_P,
      client: this.#bedrockClient,
    }, BedrockModels.CONDENSE_LLM_RUN_NAME)
    
    this.#chatModel = BedrockModels.#BedrockWithDebugListeners({
      model: chatModelId,
      region: region,
      temperature: BedrockModels.#CHAT_MODEL_TEMPERATURE,
      maxTokens: BedrockModels.#CHAT_MODEL_MAX_TOKENS,
      topP: BedrockModels.#CHAT_MODEL_TOP_P,
      client: this.#bedrockClient,
    }, BedrockModels.CHAT_LLM_RUN_NAME)
  }

  static #BedrockWithDebugListeners(args, runName) {
    return new BedrockChat(args)
      .withConfig({ runName: runName })
      .withListeners({
        onStart: BedrockModels.#logStart,
        onEnd: BedrockModels.#logEnd,
      })
  }

  static #logStart(run) {
    console.info("Calling Bedrock")
    const input = run?.inputs?.messages?.[0]?.[0].content
    console.debug(`Model input: ${input}`)
  }

  static #logEnd(run) {
    const output = run?.outputs?.generations?.[0]?.[0]?.text
    console.debug(`Model output: ${output}`)
  }

  getSelfQueryModel() {
    return this.#selfQueryModel
  }
  getCondenseModel() {
    return this.#condenseModel
  }
  getChatModel() {
    return this.#chatModel
  }
}
