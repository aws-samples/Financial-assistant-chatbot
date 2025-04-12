// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda, RunnableMap, RunnablePassthrough } from "@langchain/core/runnables"
import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";

const SEARCH_TYPE = process.env.SEARCH_TYPE;

const AWS_REGION = process.env.AWS_REGION;

export class SelfQueryRetriever {
  #numberOfResults
  #selfQueryModel
  #selfQueryPrompt
  #kbId
  #bedrockAgentClient

  constructor(numberOfResults, selfQueryModel, selfQueryPromptTemplate, kbId) {
    this.#kbId = kbId
    this.#numberOfResults = numberOfResults
    this.#selfQueryModel = selfQueryModel
    this.#bedrockAgentClient = new BedrockAgentRuntimeClient({ region: AWS_REGION });

    this.#selfQueryPrompt = ChatPromptTemplate.fromTemplate(
      selfQueryPromptTemplate
    )
  }
  
  // Helper functions
  static #extractContext(input) {
    console.info("Transforming dictionary from parsed XML string into attributes dictionary")
    console.debug(`Input dict: ${JSON.stringify(input)}`)

    let extractRephrasedText = (inputString) => {
      const regex = /<rephrased>([\s\S]*?)<\/rephrased>/;
      const match = inputString.match(regex);
      return match ? match[1].trim() : null;
    };
    
    let extractRephrasedFilters = (inputString) => {
      const regex = /<filters>([\s\S]*?)<\/filters>/;
      const match = inputString.match(regex);
      return match ? match[1].trim() : null;
    };
    
    const outputDict = {
      "optimizedQuery": extractRephrasedText(input.content) || [],
      "filters": extractRephrasedFilters(input.content) || [],
    }
    return outputDict
  }

  #executeKnowledgeBaseQuery = async (dict) => {
    const optimizedQuery  = dict.optimizedQuery;
    try {
      const filters = JSON.parse(dict.filters);
      const kbInput = {
        knowledgeBaseId: this.#kbId, 
        retrievalQuery: {
          text: optimizedQuery, 
        },
        retrievalConfiguration: { 
          vectorSearchConfiguration: {
            numberOfResults: this.#numberOfResults,
            overrideSearchType: SEARCH_TYPE,
            filter: filters,
          },
        },
      };
      const kbCommand = new RetrieveCommand(kbInput);
      const kbResponse = await this.#bedrockAgentClient.send(kbCommand);
      return {optimizedQuery,kbResponse};
    } catch (error) {
        console.error(error);
        console.debug("Cannot handle the filters, querying without them...")
        const kbInputWithoutFilter = {
          knowledgeBaseId: this.#kbId,
          retrievalQuery: {
            text: optimizedQuery,
          },
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: this.#numberOfResults,
              overrideSearchType: SEARCH_TYPE,
            },
          },
        };
  
        const kbCommandWithoutFilter = new RetrieveCommand(kbInputWithoutFilter);
        const kbResponse = await this.#bedrockAgentClient.send(kbCommandWithoutFilter);
        return {optimizedQuery,kbResponse};
    }
  };

  async getReferences(dict) {
    const {optimizedQuery,kbResponse} = dict;
    let references = '';
    kbResponse.retrievalResults.forEach((result, index) => {
      references += `<reference ${index + 1}>${result.content.text}</reference ${index + 1}>\n`;
    });

    let referenceArray = [];
    try {
      const fileNames = new Set();
      referenceArray = kbResponse.retrievalResults.reduce((acc, result) => {
        const uri = result.location.s3Location.uri;
        const fileName = uri.split('/').pop();
        if (!fileNames.has(fileName)) {
          fileNames.add(fileName);
          acc.push(fileName);
        }
        return acc;
      }, []);
    } catch (error) {
      referenceArray = [];
    }
    return { optimizedQuery, references, referenceArray };
  }

  getRunnable() {
    return RunnableMap.from({
        question: new RunnablePassthrough()
      })
      .pipe(this.#selfQueryPrompt)
      .pipe(this.#selfQueryModel)
      .pipe(new RunnableLambda({
        func: SelfQueryRetriever.#extractContext
      }))
      .pipe(new RunnableLambda({
        func: this.#executeKnowledgeBaseQuery 
      }))
      .pipe(new RunnableLambda({
        func: (input) => this.getReferences(input)
      }))
  }
}
