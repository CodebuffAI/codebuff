type TextSegment = {
  text: string
  link?: {
    url: string
  }
}

export type faq = {
  question: string
  answer: TextSegment[]
}

export const faqs: faq[] = [
  {
    question: "Do you store my data?",
    answer: [{
      text: "We store your chat history and logs for 7 days. We pass your files to Anthropic and OpenAI servers, but we do not store them. Eventually, we want to support a Privacy Mode where no data is stored."
    }]
  },
  {
    question: "What have other users made with Codebuff?",
    answer: [{
      text: "Many users built real apps over a weekend for their teams and personal use. Others also frequently use Codebuff to write unit tests. They would build a feature in parallel with unit tests and have Codebuff do loops to fix up the code until the tests pass. They would also ask it to do drudge work like set up Oauth flows or API scaffolding. At the end of the day, you can spend more of their time thinking about architecture and design, instead of implementation details."
    }]
  },
  {
    question: "Why should I use Markdown files?",
    answer: [
      {text: "You can use a knowledge.md file to give Codebuff more context about your codebase, like you're introducing it to another engineer. All files ending in '.knowledge.md' are loaded into context automatically, and you can use the files to do your own prompt engineering in them too. We currently have a knowledge.md file in almost every directory."}
    ]
  },
  {
    question: "What models do you use?",
    answer: [{
      text: "We primarily use Claude 3.5 Sonnet for the coding, and Claude 3.5 Haiku to find relvant files. We also use GPT-4o-mini as a fallback to rewrite files with an intended edit."
    }]
  },
  {
    question: "Can I tell Codebuff to ignore certain files?",
    answer: [
      {text: "Yes! Use '.codebuffignore' to tell Codebuff to ignore these files or folders. Codebuff also does not read 'gitignore'd files."}
    ]
  },
  {
    question: "How does Codebuff actually work?",
    answer: [
      {text: "You invoke it in your terminal with 'codebuff' and it starts by running through the source files in that directory and subdirectories and parsing out all the function and class names (or equivalents in 11 languages) with a tree-sitter library. Then, it fires off a request to Claude Haiku 3.5 to cache this codebase context so user inputs can be responded to with lower latency (Prompt caching is OP!). We have a stateless server that passes messages along to Anthropic or OpenAI and websockets to ferry data back and forth to clients. Claude 3.5 Haiku picks the relevant files, and we load them into context and Claude 3.5 Sonnet responds with the right edit."}
    ]
  },
  {
    question: "Can I integrate Codebuff into my app/product/system?",
    answer: [
      {text: "We currently have an alpha SDK that exposes the same natural language interface for your apps to call and receive code edits. "},
      {text: "Sign up here for early access!", link: {url: "https://codebuff.retool.com/form/c8b15919-52d0-4572-aca5-533317403dde"}}
    ]
  },
  {
    question: "Why is Codebuff so expensive?",
    answer: [{
      text: "We realize this is a lot more than competitors, but we do more expensive LLM calls with more context."
    }]
  },
  {
    question: "I have more questions!",
    answer: [
      {text: "Contact us at "},
      {text: "support@codebuff.com", link: {url: "mailto:support@codebuff.com"}},
      {text: " or "},
      {text: "join our Discord", link: {url: "https://discord.gg/mcWTGjgTj3"}},
      {text: "!"}
    ]
  }
]