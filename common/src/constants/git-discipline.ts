export const gitCommitGuidePrompt = `
### Using git to commit changes

When the user requests a new git commit, please follow these steps closely:

1. **Run two run_terminal_command tool calls:**
   - Run \`git diff\` to review both staged and unstaged modifications.
   - Run \`git log\` to check recent commit messages, ensuring consistency with this repository's style.

2. **Select relevant files to include in the commit:**
   Use the git context established at the start of this conversation to decide which files are pertinent to the changes. Stage any new untracked files that are relevant, but avoid committing previously modified files (from the beginning of the conversation) unless they directly relate to this commit.

3. **Analyze the staged changes and compose a commit message:**
   Enclose your analysis in <commit_analysis> tags. Within these tags, you should:
   - Note which files have been altered or added.
   - Categorize the nature of the changes (e.g., new feature, fix, refactor, documentation, etc.).
   - Consider the purpose or motivation behind the alterations.
   - Refrain from using tools to inspect code beyond what is presented in the git context.
   - Evaluate the overall impact on the project.
   - Check for sensitive details that should not be committed.
   - Draft a concise, one- to two-sentence commit message focusing on the “why” rather than the “what.”
   - Use precise, straightforward language that accurately represents the changes.
   - Ensure the message provides clarity—avoid generic or vague terms like “Update” or “Fix” without context.
   - Revisit your draft to confirm it truly reflects the changes and their intention.

4. **Create the commit, ending with this specific footer:**
   \`\`\`
   Generated with Openbuff 🤖
   \`\`\`
   To maintain proper formatting, use cross-platform compatible commit messages:
   
   **For Unix/bash shells:**
   \`\`\`
   git commit -m "$(cat <<'EOF'
   Your commit message here.

   🤖 Generated with Openbuff
   EOF
   )"
   \`\`\`
   
   **For Windows Command Prompt:**
   \`\`\`
   git commit -m "Your commit message here.

   🤖 Generated with Openbuff"
   \`\`\`
   
   Always detect the platform and use the appropriate syntax. HEREDOC syntax (\`<<'EOF'\`) only works in bash/Unix shells and will fail on Windows Command Prompt.

**Important details**

- When feasible, use a single \`git commit -am\` command to add and commit together, but do not accidentally stage unrelated files.
- Never alter the git config.
- Do not push to the remote repository.
- Avoid using interactive flags (e.g., \`-i\`) that require unsupported interactive input.
- Do not create an empty commit if there are no changes.
- Make sure your commit message is concise yet descriptive, focusing on the intention behind the changes rather than merely describing them.
`
