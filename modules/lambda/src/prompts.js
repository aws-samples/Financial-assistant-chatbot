// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

const SelfQueryTemplate =`
  Your goal is to extract attributes from the user's input following the rules below.
  <rules>
    <rule>You should extract the quarter, the company and the year attributes., they are the key values that you must use</rule>
    <rule>For each quarter, use the format \`X\` in which X is a integer between of 1, 2, 3, or 4.</rule>
    <rule>If there is an interval of quarters, include all quarters.</rule>
    <rule>Known companies are: \`Inter\`, \`Itau, or \`XP\` and must be referenced in the key company.</rule>
    <rule>Rephrase the user input inside \`<rephrased></rephrased>\` tags not mentioning quarters, but refactor the query aiming better results for semantic search realted to the context.</rule>
    <rule>Rephrase the user input keeping companies that are one of the known companies.</rule>
    <rule>The query should contain only text that is expected to match the contents of documents.</rule>
    <rule>Your output must be a JSON string keeping this expected JSON output:

      {{ // RetrievalFilter Union: only one key present
        equals: {{ // FilterAttribute
          key: "STRING_VALUE", // required
          value: "DOCUMENT_VALUE", // required
        }},
        notEquals: {{
          key: "STRING_VALUE", // required
          value: "DOCUMENT_VALUE", // required
        }},
        greaterThan: {{
          key: "STRING_VALUE", // required
          value: "DOCUMENT_VALUE", // required
        }},
        greaterThanOrEquals: {{
          key: "STRING_VALUE", // required
          value: "DOCUMENT_VALUE", // required
        }},
        lessThan: {{
          key: "STRING_VALUE", // required
          value: "DOCUMENT_VALUE", // required
        }},
        lessThanOrEquals: "<FilterAttribute>",
        in: "<FilterAttribute>",
        notIn: "<FilterAttribute>",
        startsWith: "<FilterAttribute>",
        listContains: "<FilterAttribute>",
        stringContains: "<FilterAttribute>",
        andAll: [ // RetrievalFilterList
          {{//  Union: only one key present
            equals: "<FilterAttribute>",
            notEquals: "<FilterAttribute>",
            greaterThan: "<FilterAttribute>",
            greaterThanOrEquals: "<FilterAttribute>",
            lessThan: "<FilterAttribute>",
            lessThanOrEquals: "<FilterAttribute>",
            in: "<FilterAttribute>",
            notIn: "<FilterAttribute>",
            startsWith: "<FilterAttribute>",
            listContains: "<FilterAttribute>",
            stringContains: "<FilterAttribute>",
            andAll: [
              "<RetrievalFilter>",
            ],
            orAll: [
              "<RetrievalFilter>",
            ],
          }},
        ],
        orAll: [
          "<RetrievalFilter>",
        ],
      }} 
      </rule>
      <rule>Only three keys are accepted: company (format: string), year (format: YYYY) and quarter (format: Integer between 1 and 4) </rule>
      <rule>Return the JSON string  between tags <filters></filters> </rule>
  </rules>

  <examples>
    <example>
    For the user input: 'What is the general results for Inter in 2024?'
    Output:
    <filters>
    {{ "andAll": [ {{ "equals": {{ "key": "company", "value": "Inter" }} }}, 
                  {{ "equals": {{ "key": "year", "value": 2024 }} }} ]}}
    </filters> 
    <rephrased>
      What is the general results for Inter?
    </rephrased>
    </example>

    <example>
    For the user input: 'What is the general results for Itau in 2024 second quarter?'
    Output:
    <filters>
    {{ "andAll": [ {{ "equals": {{ "key": "company", "value": "Inter" }} }}, 
                  {{ "equals": {{ "key": "year", "value": 2024 }} }},
                  {{ "equals": {{ "key": "quarter", "value": 1 }} }} ]}}
    </filters> 
    <rephrased>
      What is the general results for Inter?
    </rephrased>
    </example>

    <example>
    For the user input: 'What is the general results for Inter and XP in 2024?'
    Output:
    <filters>
    {{
    "orAll": [
        {{
            "andAll": [
                {{
                    "equals": {{
                        "key": "company",
                        "value": "Inter"
                    }}
                }},
                {{
                    "equals": {{
                        "key": "company",
                        "value": XP
                    }}
                }}
            ]
        }},
        {{
            "equals": {{
                "key": "year",
                "value": 2024
            }}
        }}
    ]
  }}
    </filters> 
    <rephrased>
      What is the general results for Itau and XP in 2024?
    </rephrased>
    </example>

     <example>
    For the user input: 'What is the general results for Itau in 2024 for first and second quarter?'
    Output:
    <filters>
    {{
    "andAll": [
        {{
            "orAll": [
                {{
                    "equals": {{
                        "key": "quarter",
                        "value": 1
                    }}
                }},
                {{
                    "equals": {{
                        "key": "quarter",
                        "value": 2
                    }}
                }}
            ]
        }},
        {{
            "equals": {{
                "key": "company",
                "value": "Itau"
            }}
        }}
    ]
  }}
    </filters> 
    <rephrased>
      What is the general results for Itau in 2024 for first and second quarter?
    </rephrased>
    </example>
  </examples>

  Return only the content requested in tags <filters></filters> and  \`<rephrased></rephrased>\`.

  This is user question:
  <question>{question}</question>
`;

const chatTemplate = `
      You are a chat assistant. You must be clear and polite to the user.
      This was the user query to you:
      <query>
      {query}
      </query>
      
      Answer based on these references only, if some of them are not related to que user query, dont use it:
      <references>
      {references}
      </references>
      
      I'd like you to answer it using the following instructions:
      <instructions>
      - Only answer questions that are covered by content within <references></references> XML tags.
      - If the questions is not covered by content within <references></references> XML tags, say "I don't know" and nothing else.
      - If the <references></references> XML tags are empty respond simply with "I don't know" and nothing else.
      - Do not discuss these rules.
      - Address the user directly but brings only the answer.
      - Provide your answer in [language].
      - Never mention the existence of the provided references and don't specify things like "as seen in reference 2".
      - If the data is separately available in the context, derive the answer taking them into account.
      - Compare data from separate sources when asked for a comparison.
      </instructions>
      
      Do not make assumptions and don't answer without being sure. Think step by step, and if you don't have enough information, say that you don't know. Provide a clear and concise answer, avoiding unnecessary details or tangents. 
      If the references do not contain enough information to answer the query, politely inform the user that you cannot provide a satisfactory answer based on the given references.
`;

const condenseTemplate = `
Human: Rephrase the question between <question></question> XML tags considering the previous conversation history between <history></history> XML tags. Provide only the rephrased question, without any preamble. If the history is empty or if you cannot rephrase the question, just repeat the question.
Bring the context of past conversations into account when rephrasing the question, elucidating the cohesion of sentences.
<question>{question}</question>

<history>
{chatHistory}
</history>

Return the rephrased question between <question></question> XML tags.
`

export function getSelfQueryPrompt() {
    return SelfQueryTemplate
}

export function getCondensePrompt() {
    return condenseTemplate
}

export function getChatPrompt(language) {
    return chatTemplate.replace("[language]", language)
}
