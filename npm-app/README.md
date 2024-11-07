# The AI coder for serious engineers

Codebuff helps you generate better code from your terminal.

1. Run `codebuff` from your project directory
2. Tell it what to do
3. It will read and write to files to produce the code you want

Note: Codebuff can run commands in your terminal as it deems necessary to fulfill your request.

## Installation

To install Codebuff, run:

```bash
npm install -g codebuff
```

## Usage

After installation, you can start Codebuff by running:

```bash
codebuff [project-directory]
```

If no project directory is specified, Codebuff will use the current directory.

After running `codebuff`, simply chat with it to say what coding task you want done.

## Features

- Interacts with your codebase using natural language
- Reads and writes files within your project directory
- Runs commands in your terminal
- Scrapes the web to gather information for tasks

Ask Codebuff to implement small features, write unit tests, write scripts, or give advice.

## Knowledge Files

To unlock the full benefits of modern LLMs, we recommend storing knowledge alongside your code. Add a `knowledge.md` file anywhere in your project to provide helpful context, guidance, and tips for the LLM as it performs tasks for you.

Codebuff can fluently read and write files, so it will add knowledge as it goes. You don't need to write knowledge manually!

Some have said every change should be paired with a unit test. In 2024, every change should come with a knowledge update!

## Tips

1. Create a `knowledge.md` file and collect specific points of advice. The assistant will use this knowledge to improve its responses.
2. Type `undo` or `redo` to revert or reapply file changes from the conversation.
3. Press `Esc` or `Ctrl+C` while Codebuff is generating a response to stop it.

## Troubleshooting

If you are getting permission errors when installing globally with '-g', or when running `codebuff`, try [installing node with a version manager](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).

#### For OSX or Unix, use [nvm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm). Run:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

#### For Windows, use [nvm-windows](https://github.com/coreybutler/nvm-windows):

Make sure to uninstall your existing node program. Then get this executable:

[Download the release .exe](https://github.com/coreybutler/nvm-windows/releases)

## Feedback

We value your input! Please email your feedback to `founders@codebuff.com`. Thank you for using Codebuff!
