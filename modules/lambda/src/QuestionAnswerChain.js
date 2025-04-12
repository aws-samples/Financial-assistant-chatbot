// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

import { BufferWindowMemory } from "langchain/memory"
import { DynamoDBChatMessageHistory } from "@langchain/community/stores/message/dynamodb"
import { RunnableLambda, RunnableMap } from "@langchain/core/runnables"
import { SelfQueryRetriever } from "./SelfQueryRetriever.js"
import { StringOutputParser } from "@langchain/core/output_parsers"
import { ChatPromptTemplate } from "@langchain/core/prompts";

export class QuestionAnswerChain {
  static CHAIN_NAME_STANDALONE_QUESTION = "Rephrasing question"
  static CHAIN_NAME_RETRIEVE_DOCUMENTS = "Retrieving documents"
  static CHAIN_NAME_ANSWER = "Answering question"

  #selfQueryRetriever
  #condensePrompt
  #chatPrompt
  #condenseModel
  #chatModel
  #memory

  constructor(dynamoDBClient,
    dynamoDBHistoryTableName,
    numberOfChatsInteractionsToRemember,
    KbId,
    numberOfResults,
    bedrockModels,
    condensePromptTemplate,
    selfQueryPromptTemplate,
    chatPromptTemplate,
    sessionId) {
    this.#selfQueryRetriever = new SelfQueryRetriever(
      numberOfResults,
      bedrockModels.getSelfQueryModel(),
      selfQueryPromptTemplate,
      KbId
    )
    this.#condensePrompt = ChatPromptTemplate.fromTemplate(condensePromptTemplate)
    this.#chatPrompt = ChatPromptTemplate.fromTemplate(chatPromptTemplate)
    this.#condenseModel = bedrockModels.getCondenseModel()
    this.#chatModel = bedrockModels.getChatModel()

    const chatHistory = new DynamoDBChatMessageHistory({
      tableName: dynamoDBHistoryTableName,
      partitionKey: "id",
      sessionId: sessionId,
      config: {region: "us-east-1"}
    })
    this.#memory = new BufferWindowMemory({
      chatHistory: chatHistory,
      k: numberOfChatsInteractionsToRemember,
      returnMessages: true,
      outputKey: "answer",
      inputKey: "question"
    })
  }

  static #extractQuestion(input) {
    console.info("Transforming dictionary from parsed XML string into attributes dictionary")
    console.debug(`Input dict: ${JSON.stringify(input)}`)

    let extractQuestion = (inputString) => {
      const regex = /<question>([\s\S]*?)<\/question>/;
      const match = inputString.match(regex);
      return match ? match[1].trim() : null;
    };
    
    const outputDict = {
      "question": extractQuestion(input.standaloneQuestion) || [],
    }
    return outputDict
  } 
  
static #formatChatResponse(input){
  console.info("Transforming dictionary from parsed XML string into attributes dictionary1")
  console.debug(`Input dict: ${JSON.stringify(input)}`)
  return {
    query: input.refs.optimizedQuery,
    references: input.refs.references,
    referenceArray : input.refs.referenceArray,
  }
}

  static #getInput(inputName) {
    return new RunnableLambda({
      func: (input) => input[inputName]
    })
  }

  static #serializeChatHistory(chatHistory) {
    console.log(chatHistory);
    console.info("Serializing chat history")
    const serializedChatHistory = chatHistory.map((chatMessage) => {
      if (chatMessage._getType() === "human") {
        return `H: ${chatMessage.content}`
      } else if (chatMessage._getType() === "ai") {
        return `A: ${chatMessage.content}`
      } else {
        return `${chatMessage.content}`
      }
    }).join("\n")
    console.debug(`Serialized chat history: ${serializedChatHistory}`)
    return serializedChatHistory
  }

  getRunnable() {
    const standaloneQuestion = RunnableMap.from({
      standaloneQuestion: RunnableMap.from({
          question: QuestionAnswerChain.#getInput("question"),
          chatHistory: new RunnableLambda({
            func: async () => {
              console.info("Loading chat history")
              const memoryVariables = await this.#memory.loadMemoryVariables({})
              return QuestionAnswerChain.#serializeChatHistory(memoryVariables.history)
            }
          })
        }).pipe(this.#condensePrompt)
        .pipe(this.#condenseModel)
        .pipe(new StringOutputParser())
    }).withConfig({ runName: QuestionAnswerChain.CHAIN_NAME_STANDALONE_QUESTION })

    const inputRephrased = RunnableMap.from({
      question: new RunnableLambda({
        func: QuestionAnswerChain.#extractQuestion
      }),
    })

    const retrievedReferences = RunnableMap.from({
      refs : QuestionAnswerChain.#getInput("standaloneQuestion").pipe(this.#selfQueryRetriever.getRunnable()),
    }).withConfig({ runName: QuestionAnswerChain.CHAIN_NAME_RETRIEVE_DOCUMENTS })

    const formatChatResponse= RunnableMap.from({
      question: new RunnableLambda({
        func: QuestionAnswerChain.#formatChatResponse
      }),
    })

    const answer = RunnableMap.from({
      answer: formatChatResponse.pipe(QuestionAnswerChain.#getInput("question")).pipe(this.#chatPrompt).pipe(this.#chatModel).pipe(new StringOutputParser()),
      docs: formatChatResponse.pipe(QuestionAnswerChain.#getInput("question")).pipe(QuestionAnswerChain.#getInput("referenceArray"))
    }).withConfig({ runName: QuestionAnswerChain.CHAIN_NAME_ANSWER })

    const fallbackChain = new RunnableLambda({
      func: async () => {
        console.info("Entering fallback chain")
        return { answer: "I'm having trouble answering the question. Please try again." }
      }
    })

    return standaloneQuestion
      .pipe(retrievedReferences)
      .pipe(answer)
      .withFallbacks({ fallbacks: [fallbackChain] })
  }

  async saveHistory(question, answer) {
    console.info("Saving history")
    console.debug(`History question: ${question}`)
    console.debug(`History answer: ${answer}`)
    await this.#memory.saveContext({
      [this.#memory.inputKey]: question
    }, {
      [this.#memory.outputKey]: answer
    })
  }
}
