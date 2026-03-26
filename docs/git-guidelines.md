# Git Safety Rules

- Never force-push `main` unless explicitly requested.
- To exclude files from a commit: stage only what you want (`git add <paths>`). Never use `git restore`/`git checkout HEAD -- <file>` to "uncommit" changes.
- Run interactive git commands in tmux (anything that opens an editor or prompts).
