import { expect, describe, it } from 'bun:test'
import { xmlToJson } from '../index'

describe('xmlToJson', () => {
  const examples = {
    // Basic cases
    simple: {
      input: `<goal>Write a test formatter</goal>`,
      expected: {
        goal: "Write a test formatter"
      }
    },

    // Nested structure cases
    withSubgoal: {
      input: `<goal>Implement authentication
  <subgoal>Add OAuth flow
    <step>Configure OAuth provider</step>
    <step>Create callback endpoint</step>
  </subgoal>
</goal>`,
      expected: {
        goal: {
          "_text": "Implement authentication",
          "subgoal": {
            "_text": "Add OAuth flow",
            "step": [
              "Configure OAuth provider",
              "Create callback endpoint"
            ]
          }
        }
      }
    },

    multipleSubgoals: {
      input: `<goal>Refactor database layer
  <subgoal>Migrate to TypeORM
    <step>Install dependencies</step>
    <step>Create entity classes</step>
  </subgoal>
  <subgoal>Add migrations
    <step>Generate initial migration</step>
    <step>Set up CI pipeline</step>
  </subgoal>
</goal>`,
      expected: {
        goal: {
          "_text": "Refactor database layer",
          "subgoal": [
            {
              "_text": "Migrate to TypeORM",
              "step": [
                "Install dependencies",
                "Create entity classes"
              ]
            },
            {
              "_text": "Add migrations",
              "step": [
                "Generate initial migration",
                "Set up CI pipeline"
              ]
            }
          ]
        }
      }
    },

    // Edge cases
    emptyTags: {
      input: `<goal><subgoal></subgoal><step></step></goal>`,
      expected: {
        goal: {
          subgoal: "",
          step: ""
        }
      }
    },

    mixedContent: {
      input: `<goal>Main goal text
    <subgoal>Subgoal with text
      <note>Important note</note>
      <step>First step</step>
    </subgoal>
    <summary>Final summary</summary>
  </goal>`,
      expected: {
        goal: {
          "_text": "Main goal text",
          "subgoal": {
            "_text": "Subgoal with text",
            "note": "Important note",
            "step": "First step"
          },
          "summary": "Final summary"
        }
      }
    },

    deepNesting: {
      input: `<goal>
    <subgoal>
      <task>
        <subtask>
          <step>Very deeply nested step</step>
        </subtask>
      </task>
    </subgoal>
  </goal>`,
      expected: {
        goal: {
          subgoal: {
            task: {
              subtask: {
                step: "Very deeply nested step"
              }
            }
          }
        }
      }
    },

    // Multiple elements and special cases
    multipleTopLevel: {
      input: `<goal>First goal</goal>
<goal>Second goal</goal>
<note>Additional note</note>`,
      expected: {
        goal: [
          "First goal",
          "Second goal"
        ],
        note: "Additional note"
      }
    },

    selfClosingTags: {
      input: `<goal>Test<br/>New line<step/></goal>`,
      expected: {
        goal: {
          "_text": "Test New line",
          "br": "",
          "step": ""
        }
      }
    },

    whitespaceHeavy: {
      input: `<goal>
    
    <subgoal>
      
      <step>  Lots of spaces  </step>
      
    </subgoal>
    
  </goal>`,
      expected: {
        goal: {
          subgoal: {
            step: "Lots of spaces"
          }
        }
      }
    },

    specialChars: {
      input: `<goal>Test & verify</goal>`,
      expected: {
        goal: "Test & verify"
      }
    }
  }

  Object.entries(examples).forEach(([name, { input, expected }]) => {
    it(`handles ${name} case`, () => {
      const result = xmlToJson(input)
      expect(result).toEqual(expected)
    })
  })
})
