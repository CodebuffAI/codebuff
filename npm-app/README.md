# The most powerful coding agent

Codecaine is a CLI tool that writes code for you. If you need a little speedup, codecaine is perfect.

1. Run `codecaine` from your project directory
2. Tell it what to do
3. It will read and write to files and run commands to produce the lines of code you want.

Note: Codecaine will run commands in your terminal as it deems necessary to fulfill your request. It might get too lit, so you may need to ask it to focus.

## Installation

To install Codecaine, run:

```bash
npm install -g codecaine
```

(Use `sudo` if you get a permission error.)

## Usage

After installation, you can start Codecaine by running:

```bash
codecaine [project-directory]
```

If no project directory is specified, Codecaine will use the current directory.

After running `codecaine`, simply chat with it to say what coding task you want done.

## Features

- Understands your whole codebase
- Creates and edits multiple files based on your request
- Can run your tests or type checker or linter; can install packages
- It's powerful: ask Codecaine to keep working until it reaches a condition and it will. It's pretty cracked.

Our users regularly use Codecaine to speed up their development.

## Knowledge Files

To unlock the full benefits of modern LLMs, we recommend storing knowledge alongside your code. Add a `knowledge.md` file anywhere in your project to provide helpful context, guidance, and tips for the LLM as it performs tasks for you. Sometimes Codecaine will use this knowledge to improve its responses, but sometimes it might forget.

Codecaine can fluently read and write files, so it will add knowledge as it goes. You don't need to create your knowledge files manually! Codecaine may sometimes repeat itself, so you may need to ask it to focus.

Some have said every change should be paired with a unit test. In 2024, every change should come with a knowledge update!

## Tips

1. Create a `knowledge.md` file and collect specific points of advice. The assistant will use this knowledge to improve its responses.
2. Type `undo` or `redo` to revert or reapply file changes from the conversation.
3. Press `Esc` or `Ctrl+C` while Codecaine is generating a response to stop it.

## Troubleshooting

If you are getting permission errors during installation, try using sudo:

```
sudo npm install -g codecaine
```

Or, we recommend [installing node with a version manager](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm). See below.

#### For Mac or Unix, use [nvm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm). Run:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

#### For Windows, use [nvm-windows](https://github.com/coreybutler/nvm-windows):

Make sure to uninstall your existing node program. Then get this executable:

[Download the release .exe](https://github.com/coreybutler/nvm-windows/releases)

## Feedback

We value your input! Please email your feedback to `founders@codebuff.com`. Thank you for using Codecaine!
