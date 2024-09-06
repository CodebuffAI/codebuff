# The AI coder for serious engineers

Use Manicode to write code faster every day.

Intended for experienced engineers in large codebases.

1. Run `manicode` from your terminal.
2. Tell it what to do.
3. It will read and write to files in your project to produce the code you want.

## Installation

To install Manicode, run:

```bash
npm install -g manicode
```

## Usage

After installation, you can start Manicode by running:

```bash
manicode [project-directory]
```

If no project directory is specified, Manicode will use the current directory.

After running `manicode`, simply chat with it to say what coding task you want done.

## Features

- Interacts with your codebase using natural language
- Reads and writes files within your project directory
- Runs commands in your terminal
- Scrapes the web to gather information for tasks

Ask Manicode to implement small features, write unit tests, write scripts, or give advice.

## Knowledge Files

To unlock the full benefits of modern LLMs, we recommend storing knowledge alongside your code. Add a `knowledge.md` file anywhere in your project to provide helpful context, guidance, and tips for the LLM as it performs tasks for you.

Manicode can fluently read and write files, so it will add knowledge as it goes. You don't need to write knowledge manually!

Some have said every change should be paired with a unit test. In 2024, every change should come with a knowledge update!

## Tips

1. Create a `knowledge.md` file and collect specific points of advice. The assistant will use this knowledge to improve its responses.
2. Type `undo` or `redo` to revert or reapply file changes from the conversation. 
3. Press `Esc` or `Ctrl+C` while Manicode is generating a response to stop it.

## Feedback

We value your input! Please email your feedback to james@manifold.markets. Thank you for using Manicode!
