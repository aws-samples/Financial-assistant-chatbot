// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

// Permission is hereby granted, free of charge, to any person obtaining a copy of this
// software and associated documentation files (the "Software"), to deal in the Software
// without restriction, including without limitation the rights to use, copy, modify,
// merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
// PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
// HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda, RunnableMap, RunnablePassthrough } from "@langchain/core/runnables"
import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";

const SEARCH_TYPE = process.env.SEARCH_TYPE;

export class SelfQueryRetriever {
  #numberOfResults
  #selfQueryModel
  #selfQueryPrompt
  #kbId
  #bedrockAgentClient

  constructor(numberOfResults, selfQueryModel, selfQueryPromptTemplate,kbId) {
    this.#kbId = kbId
    this.#numberOfResults = numberOfResults
    this.#selfQueryModel = selfQueryModel
    this.#bedrockAgentClient = new BedrockAgentRuntimeClient({ region: "us-east-1" });


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
