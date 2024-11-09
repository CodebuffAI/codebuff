import { ReactNode } from 'react'

type TextSegment = {
  text: string
  link?: {
    url: string
  }
}

export type faq = {
  question: string
  answer: ReactNode
}

export const faqs: faq[] = [
  {
    question: "Do you store my data?",
    answer: "We don't store your codebase. Mostly our server is a thin client that passes data along to LLM providers like OpenAI and Anthropic. We store logs of your chats temporarily to help us debug. We also store portions of chat in our database. Soon, we plan to support a Privacy Mode where no data at all is stored."
  },
  {
    question: "What have other users made with Codebuff?",
    answer: "Many users built real apps over a weekend for their teams and personal use. Others also frequently use Codebuff to write unit tests. They would build a feature in parallel with unit tests and have Codebuff do loops to fix up the code until the tests pass. They would also ask it to do drudge work like set up Oauth flows or API scaffolding. At the end of the day, you can spend more of their time thinking about architecture and design, instead of implementation details."
  },
  {
    question: "Can I specify custom instructions for Codebuff?",
    answer: "Yes! We recommend you create knowledge.md files to give Codebuff more context about your codebase, like you're introducing it to another engineer. All file names ending in knowledge.md are loaded into context automatically, and you can use the files to do your own prompt engineering in them too. We currently have a knowledge.md in almost every directory"
  },
  {
    question: "What models do you use?",
    answer: "We primarily use Claude 3.5 Sonnet for the coding, and Claude 3.5 Haiku to find relvant files. We also use GPT-4o-mini as a fallback to rewrite files with an intended edit."
  },
  {
    question: "Can I tell Codebuff to ignore certain files?",
    answer: "Yes! Use '.codebuffignore' to tell Codebuff to ignore these files or folders. Codebuff also does not read 'gitignore'd files."
  },
  {
    question: "How does Codebuff actually work?",
    answer: "You invoke it in your terminal with 'codebuff' and it starts by running through the source files in that directory and subdirectories and parsing out all the function and class names (or equivalents in 11 languages) with a tree-sitter library. Then, it fires off a request to Claude Haiku 3.5 to cache this codebase context so user inputs can be responded to with lower latency (Prompt caching is OP!). We have a stateless server that passes messages along to Anthropic or OpenAI and websockets to ferry data back and forth to clients. Claude 3.5 Haiku picks the relevant files, and we load them into context and Claude 3.5 Sonnet responds with the right edit."
  },
  {
    question: "Can I integrate Codebuff into my app/product/system?",
    answer: (
      <>
        We currently have an alpha SDK that exposes the same natural language interface for your apps to call and receive code edits.{' '}
        <a href="https://codebuff.retool.com/form/c8b15919-52d0-4572-aca5-533317403dde" className="underline hover:text-blue-500">
          Sign up here for early access!
        </a>
      </>
    )
  },
  {
    question: "Why is Codebuff so expensive?",
    answer: "We realize this is a lot more than competitors, but in exchange, we do more LLM calls with more examples native to your codebase that leads to more accurate identification of relevant files and better code edits."
  },
  {
    question: "I have more questions!",
    answer: (
      <>
        Contact us at{' '}
        <a href="mailto:support@codebuff.com" className="underline hover:text-blue-500">
          support@codebuff.com
        </a>
        {' '}or{' '}
        <a href="https://discord.gg/mcWTGjgTj3" className="underline hover:text-blue-500">
          join our Discord
        </a>
        !
      </>
    )
  }
]