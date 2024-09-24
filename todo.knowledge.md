[x] Should indicate if diff is still generating somehow...
    - send to client the file changes still planned. Wait for them before allowing user input?
- Improve speed by prompting it to rely more on diffs instead of reproducing the whole file
[x] Prompt engineer it to automatically make knowledge changes when you correct it
[x] it's doing a poor job loading all the relevant files into context. Need to add more explicity steps for this.
[x] Indenting fails when it makes multiple changes with different indent levels.
[x] More chain of thought for main prompt. <planning> blocks, <code_review>, <brainstorm>, etc.
[x] Delete files
[x] Shift + Enter, and pasting in stuff with new lines. Update: not really possible

[x] Failed to replace in the new contents (but did expand it for the old content):
// ... (keep the existing setup code)
[x] Continuation 2 led to infinite responses
[x] cancelling before the prompt starts being genereated leads to error of two user messages in a row
- Show commands available in a bar under the input (not sure if this is possible)
[x] Escalate when old diff does not match. Got case where a helper function in the middle of two others was moved up, but diff didn't match because it ignored the helper function.
[x] Stuck in loop: Prompting claude num messages: 21, continuing to generate
[x] Backspace after typing more than one line is buggy

[x] Dawson's case of wanting it to scrape documentation from a url and answer questions with it.
- x% knowledge written in menu based on number of commits to knowledge files
[x] How it could run bash:
1. First, let's build the `common` package:

```bash
cd common
yarn build
cd ..
```
Important. Can use commandline to search for code. Could move files.

[x] Try asking first if the complete file is listed, and then automatically generate diffs.

[] create some structure in a knowledge file for users to initially fill out.
- Project overview
 - Goals
 - Project structure
 - Coding do's and don'ts

 [] reverting doesn't work with created files
 [x] File paths using too much context?
 [x] Error on server didn't print the error (or maybe it did and the terminal overwrote it...)
 [x] Change ip address to be from api.manicode.ai

Notes from Janna & Stephen test
[x] backspace on windows doesn't clear the char, just moves cursor
[x] Tried to do left arrow and it didn't work
[x] Failed to apply any edits. They all failed even after a second attempt. This was on Windows
[x] CTRL-C doesn't work

[] Kill if it continues too far without user prompt.
[] Prompt it not to generate the whole file when just making a local edit. Consider just reproducting the function edited. Or a block a code.
    - Before editing a file, get it to say what changes it will make and then edit just those sections.
[x] Consider confirming with the user whether to go ahead and make a change if not that confident or want more input from the user
[] Force updates: run the command to update app.
[] Store previous user input's and always include that history in system prompt.
    - Can also allow you to press up arrow to go through whole history
[x] Changes prompt is printing object for most previous messages in message history
[x] It keeps requesting files that are already in its context. Need to highlight those paths again somewhere?
    - Requests a file before editing that it just got.
[] Knowledge files should be treated more like regular files, but with system prompts to frequently include them


-- Instead, of below, apply edits immediately. Track all changes for a message via an id. Fix conccurent request by subscribing/unsubscribing to response with id.
[x] Give it a new marker token that will await all file changes, so then it can run tsc or tests, etc.
    - It is using grep to see if changes went through, but they haven't so gets in a loop.
    - Realized we could just apply the edits before the tool call. We were already passing them through.
[x] Was able to start a concurrent request after cancelling the last one...
[] Changes behavior like removing if guard if statements at the top, removing cases of logs/errors, adds <form>. It should only do the minimal change and assume existing code is there for a reason.
[x] Terminal command that doesn't finish bricks manicode
[x] Easy to forget to run it in root directory.
[x] Allow pasting new lines based on timing strategy
[] It's not saving useful info like that this is a Windows machine and it shouldn't be using grep into a knowledge file.
[x] Budget of tokens when reading files, and skip files that put it over the limit.
[x] Still does too many extra things
[x] Doesn't consistently request new files when it needs to
[x] Scrape urls by default, like we request files by default
[x] The user may have edited files since your last change. Please try to notice and perserve those changes. Don't overwrite these please!
[x] Show a message when manicode is out of date. Or figure out how to automatically update.
[] The "// add this blah" comments are really annoying. Strip them out in the diff step
[x] The comprehensive files list generates a huge amount of thinking that is probably slow
[x] Try a lower temperature. Might prevent it from doing random stuff. 
    - apparently it's been 0 this whole time, huh (for claude)
    - Also openai defaults to 0
[] Add current file diff from main into context (git status/git diff?)

[x] It thought that update_file_context would create a file? (a knowledge file?)
[] Claude doesn't leave a comment that there's more code in between when it should. Then lots gets deleted
[] Try using the native stop marker feature
[] Use tree sitter to include exported tokens ttps://github.com/tree-sitter/node-tree-sitter
    See how github implemented code search: ttps://docs.github.com/en/repositories/working-with-files/using-files/navigating-code-on-github#precise-and-search-based-navigation
[] Multiple file blocks for the same file could fail to patch
[] Still hallucinating without getting the file: Totally destroyed my package .json by removing random scripts & dependencies, changing a bunch of stuff around
[] Create tests for the full user input. Set up fake project data for this.
[] Use gpt-4o mini to grade tests

[] Updated a function in a file, but didn't include comments at the top or bottom for existing code
[] Looks in wrong directory for a file, e.g. web/components/comments instead of web/components/buttons
    web/components/profile/profile-comments.tsx instead of web/components/comments/profile-comments.tsx
[] Ari: editing is failing: deleting sections of code it shouldn't.
    - [J] Removes commented out code, other comments
[] Doesn't give up control after running terminal commands. Just keeps running more
[] Says reconnected, but actually doesn't go after
[] Run in a containerls
    - Maybe distribute as brew package which would have more permissions?
    - Check files being edited to be within project dir (no '..')
[x] Send a command, then just run it. if it goes through, print.
    - thefuck util that could change 
    - should look more like shell
    - could have two panel one for you, other shows claude's response. Claude's commands go on your side
[] Got file path wrong: backend instead of npm-app for project-files
[] Still is overwritting a user's change every time