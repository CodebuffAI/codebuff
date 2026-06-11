/**
 * Homepage FAQ content.
 *
 * Shared between the visible FAQ section (home-client.tsx), the FAQPage
 * JSON-LD on the home page, and /llms.txt — keep all three consistent by
 * editing only this file.
 */
export const homeFaqs = [
  {
    question: 'How can it be free?',
    answer: 'Freebuff is supported by text ads shown in the CLI.',
  },
  {
    question: 'What models do you use?',
    answer:
      'In full mode, you can choose from:\n\n- DeepSeek V4 Pro: smartest. Its API collects data for training.\n- DeepSeek V4 Flash: most efficient. Its API also collects data for training.\n\nLimited mode uses DeepSeek V4 Flash only.\n\nAlso, Gemini 3.1 Flash Lite handles file finding and research. Connect your ChatGPT subscription to unlock GPT-5.4 for deep thinking.',
  },
  {
    question: 'Which countries is Freebuff available in?',
    answer:
      'All countries. Freebuff is available in "full" or "limited" mode. The following countries have full access:\n\nUnited States, Canada, United Kingdom, Australia, New Zealand, Norway, Sweden, Netherlands, Denmark, Germany, France, Italy, Spain, Portugal, Finland, Belgium, Luxembourg, Liechtenstein, Switzerland, Austria, Singapore, Malta, Israel, Ireland, and Iceland.\n\nIf you are outside those countries or using a VPN, Freebuff still works in limited mode.',
  },
  {
    question: 'What is limited mode?',
    answer:
      'Limited mode lets you use Freebuff outside the full-access countries, or while using a VPN. It includes DeepSeek V4 Flash only, with 5 one-hour sessions per day.',
  },
  {
    question: 'Are you training on my data?',
    answer:
      "No. We do not share your data with third parties that would train on it or use it for another purpose, unless you choose a model clearly labeled as 'Collects data for training'.",
  },
  {
    question: 'What data do you store?',
    answer:
      "We don't store your codebase. We only collect minimal logs for debugging purposes.",
  },
  {
    question: 'What else is cool in Freebuff?',
    answer: `Freebuff comes with 9 specialized subagents:
- file-picker finds relevant files across your codebase
- code-reviewer gives critical feedback on your changes
- browser-use lets the AI control a real browser to test your app
- thinker-gpt does deep reasoning (connect your ChatGPT subscription)
- and more.

After every response, it generates 3 clickable follow-up suggestions so you always know what to do next.

For big tasks, try the commands /interview → /plan → (implement) → /review to go from idea to polished code.`,
  },
]
