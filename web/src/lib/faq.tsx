import { ReactNode } from 'react'

export type faq = {
  question: string
  answer: ReactNode
}

export const faqs: faq[] = [
  {
    question: 'Do you store my data?',
    answer: (
      <>
        We don't store your codebase. Mostly our server is a thin client that
        passes data along to OpenAI and Anthropic. We store logs of your chats
        temporarily to help us debug. We also store portions of your chat
        history in our database. Soon, we plan to support a Privacy Mode where
        no data at all is stored.
      </>
    ),
  },
  {
    question: 'What models do you use?',
    answer: (
      <>
        We primarily use Claude 3.5 Sonnet for the coding, and Claude 3.5 Haiku
        to find relevant files. We also use GPT-4o-mini as a fallback to rewrite
        files with an intended edit (using their fancy Predicted Outputs API).
      </>
    ),
  },
  {
    question: 'Can I specify custom instructions for Codebuff?',
    answer: (
      <>
        Yes! We recommend you create knowledge.md files to give Codebuff more
        context about your codebase, like you're introducing it to another
        engineer. All file names ending in knowledge.md are loaded into context
        automatically, and you can use the files to do your own prompt
        engineering for Codebuff. If you do not have a knowledge.md file,
        Codebuff will not write one, but it will update existing knowledge.md
        files autonomously. The Codebuff codebase currently has a knowledge.md
        in almost every directory.
      </>
    ),
  },
  {
    question: 'Can I tell Codebuff to ignore certain files?',
    answer: (
      <>
        Codebuff by default will not read files that are specified in your
        .gitignore. You can also create a '.codebuffignore' file to specify
        additional files or folders to ignore.
      </>
    ),
  },
  {
    question: 'Help! Codebuff made a bad change, how I undo it?',
    answer: (
      <>
        Type 'undo' to remove the edits! For other cool features, type 'help' in
        the terminal when Codebuff is running.
      </>
    ),
  },
  {
    question: 'Can I see the changes that Codebuff has made as a diff?',
    answer: (
      <>
        Yes! Type 'diff' after Codebuff has made a change to see the edits! For
        other cool features, type 'help' in the terminal when Codebuff is
        running.
      </>
    ),
  },
  {
    question: 'How does Codebuff actually work?',
    answer: (
      <>
        You invoke it in your terminal with 'codebuff' and it starts by running
        through the source files in that directory and subdirectories and
        parsing out all the function and class names (or equivalents in 11
        languages) with the tree-sitter library. Then, it fires off a request to
        Claude Haiku 3.5 to cache this codebase context so user inputs can be
        responded to with lower latency (Prompt caching is OP!). We have a
        stateless server that passes messages along to Anthropic or OpenAI and
        websockets to ferry data back and forth to clients. Claude 3.5 Haiku
        picks the relevant files, and we load them into context and Claude 3.5
        Sonnet responds with the right edit.
      </>
    ),
  },
  {
    question: 'What have other users made with Codebuff?',
    answer: (
      <>
        Many users do real work professionally on large codebases with Codebuff.
        You can use Codebuff to write features faster, create and run unit tests
        until they pass, or add integrations to new API's. Codebuff is great for
        any task that feels like drudge work, such as setting up OAuth or
        writing one-off scripts. We've also seen users build whole apps from
        scratch over the weekend for their teams and personal use. At the end of
        the day, with Codebuff you can spend more of your time thinking about
        architecture and design, instead of implementation details.
      </>
    ),
  },
  {
    question: 'Can I integrate Codebuff into my app/product/system?',
    answer: (
      <>
        We currently have an alpha SDK that exposes the same natural language
        interface for your apps to call and receive code edits.{' '}
        <a
          href="https://codebuff.retool.com/form/c8b15919-52d0-4572-aca5-533317403dde"
          className="no-underline hover:underline"
        >
          Sign up here for early access!
        </a>
      </>
    ),
  },
  {
    question: 'Why is Codebuff so expensive?',
    answer: (
      <>
        We realize it costs a bit more than alternatives, but in exchange,
        Codebuff does more LLM calls using more examples from your codebase,
        leading to better code edits.
      </>
    ),
  },
  {
    question: 'I have more questions!',
    answer: (
      <>
        Contact us at{' '}
        <a
          href="mailto:support@codebuff.com"
          className="no-underline hover:underline"
        >
          support@codebuff.com
        </a>{' '}
        or{' '}
        <a
          href="https://discord.gg/mcWTGjgTj3"
          className="no-underline hover:underline"
        >
          join our Discord
        </a>
        !
      </>
    ),
  },
]
