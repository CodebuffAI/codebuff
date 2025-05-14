export const COMMIT_SELECTION_PROMPT = `You are an expert at identifying substantial and complete code changes in git commits.

Given a list of commits, identify which ones represent substantial and complete changes that would make good evaluation examples for an AI coding assistant.

A good evaluation commit should:
1. Make a meaningful, self-contained change
2. Have a clear purpose that can be described without implementation details
3. Not be trivial (like fixing typos) or massive (like initial project setup)
4. Represent a change that a skilled developer could implement given a description

For each commit you select, briefly explain why it makes a good evaluation example.

Format your response as a JSON object with a "commits" array containing objects with "sha" and "reason" fields.
Example:
{
  "commits": [
    {
      "sha": "abc123",
      "reason": "Adds a new feature X that is well-scoped and could be implemented different ways"
    }
  ]
}
`

export const SPEC_GENERATION_PROMPT = `Given a git commit that made a specific change to a codebase, write a clear specification describing WHAT changed.

First, use <thinking> tags to describe the change in detail and what should go into the spec.

Then, generate the spec.

The spec should:
1. Focus on the observable behavior or structure that changed
2. Not include implementation details or code
3. Not prescribe HOW to make the change
4. Be clear enough that a skilled developer or AI could implement it
5. Be phrased as what needs to be done, not what is already done.

The spec will be used to test an AI coding assistant's ability to implement the change from scratch.

Format your response as a clear, concise paragraph describing what is to be changed (based on what was changed in this commit).`
