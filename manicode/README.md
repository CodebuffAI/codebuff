# Manicode

Manicode is an AGI-level dev that runs from your command line. It has access to all files in your project and carries out tasks for you.

## Knowledge

LLM's need context. To unlock the full benefits of modern LLM's, we think you should start storing knowledge side-by-side with your code. Add a `knowledge.md` file anywhere in your project to provide helpful context, guidance, and tips for the LLM as it does tasks for you.

And now that Manicode can fluently read and write files, it can add knowledge as it goes. No need to write it yourself (unless you want to!).

Some have said every change should be paried with a unit test. In 2024, every change should come with a knowledge update!

## Installation

To install Manicode, run:

```bash
npm install -g manicode
```

## Usage

After installation, you can start Manicode by running:

```bash
manicode
```

### Commands

- Press `Esc` to open the menu or stop the current AI response
- Use `Left` and `Right` arrow keys to navigate through file versions
