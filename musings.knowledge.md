This file contains various ideas about how Manicode could work. Most of them are not what we'll end up doing, but it gives some flavor of the strategy.


- Gather knowledge from users
    - Through terminal
        - [Manilearn.sh](http://Manilearn.sh) that just asks you questions
        - Have an npm package so you can do `yarn manicode` or `yarn manilearn`? Or executable.
        - Or, make manilearn an exclusively web app thing?
            - Manicode should still send new knowledge as it learns when the user teaches it something it got wrong. It should condense that knowledge into a few sentences and an example of wrong and right.
    - Through web app
        - Add long form knowledge or short points
            - Use markdown. With an editor that lets you insert code snippets
        - Search over existing knowledge and edit or remove it
        - Edit code from your browser???
            - It could just create changes and you could approve them.
            - You keep telling it to tweak stuff in just text. When satisfied, you hit the commit button. There is no commit message; that is generated. (commit message ends with “—manicode”)
            - Might not be worth even having a terminal. You could just connect to github. Then you have permanent access to the files
                - Some day it should just represent the code diffs itself and not use github except to read the current state of files.
- Use it to prompt claude sonnet 3.5 in a repl, with learnings for how to get it to edit files
- Have own script to gather info from codebase
    - File structure
    - Exported tokens
    - Claude summary of each directory, computed recursively
    - Try to find database schema. If not, ask for a file where it exists, or let them paste it in.
    - Try to find api schema. If not ask where it is.
    - Overall knowledge of tech stack and how the technologies are used.
    

## Problems

- ~~It’s hard to get it to edit the files properly~~
    - It defaults to a lazy style of specifying the changes where it writes the line it’s adding and adds a comment saying “// the next part is the same as before”
    - When you do force it into a framework, like with <replace> and <with> blocks, it is more likely to forget imports and other small changes
    - Should try again with getting it to specify things naturally and then translate that into replace blocks with another claude call?
        - [J] I did this, and it seems to be working.
    - Add it to the system prompt to ingrain the replace-with structure?
    - Use <A> and <B> tags in hopes that it will be less lazy?
- [x]  It cuts off after a long change
- What’s the app structure of Manicode?
    - Users should use it as a console application
    - They should install it as an npm package (later: python package)
    - It has a basic console application that communicates with the server
        - has to reveal a significant portion of the algorithm
            - Unless we upload their whole codebase to the server?
        - Upload files to our server vs. thin wrapper calls to claude that go through our server
            - The latter still does upload files to our server. It applies the edits locally (which we might still do under the previous approach). It does reveal the prompts
        - Call claude directly. Can’t leak our key, but they could set theirs
            - This is a bad user experience, so no
        - Winner is upload files to server.
            - But we can do it just-in-time?
                - Send list of files and exports up on init
                - Send files when claude asks for them
            - Vs. Maintain files
                - We might move in this direction over time. But it’s easier to start with just-in-time fetching of files
    - Node application on client
        - Reads files, Reads user input
        - Maintains a websocket with server where we send files and user input, and receive claude’s output chats + file updates
    - Server
        - Maintains websockets with clients
        - Makes calls to Claude

## Stages

- Discussion
    
    I want to maximize learning while not doing duplicate work. I’m working toward an application that other people can try out. Their dogfooding will be important.
    
    I’m already confident enough that I want to build out this prototype app.
    
    - Seems like the tool calls will be necessary for external use. So I want to try that
    - The way the app tracks lessons will be key to how it is used. So I can also try implementing that to get some iteration in there.
    - Only after that should I ship the prototype, and have manifold people start using it (they can add knowledge) to get feedback.
- [x]  Local manicode script
- [x]  Set up server
- [x]  Make claude calls via server
    - Just a user prompt and file information sent via websocket
    - Server then runs all the claude calls, and streams the response, including file changes to apply
- [x]  Tool calls to fetch the files
    - Necessary for codebases where I can’t load all the files into context (unlike manicode)
- [ ]  Track lessons
    - Go to non-canonical mode for terminal.
    - Set up menu system
        - Can cancel out of an ongoing prompt.
        - Use up and down arrows to go through history of prompts
        - After prompt finishes, you have menu options
            - Space: continue
            - r: revert change
            - l: add a lesson based on this change and possibly previous changes in the conversation
            - Esc: back to prompt creation
                - Esc: main menu
                    - l: lessons. You can type a lesson or scroll through history of lessons
                    - Space: go to a new prompt
                    - Esc: quit application
    - Save lessons locally? .manicode file
        - A lot simpler techically than trying to merge your knowledge with other team members
        - You know all the knowledge added. It conforms to your own style.
        - But, most of the codebase knowledge is in common. You are just creating more work for each engineer.
            - Allow users to export and import lessons!
        - Alternately, users commit their lessons to a tracked file (lessons.manicode.md). People can view and modify the lessons others have added. (or they can add to git ignore)
            - This is great. It’s super transparent, and can use existing coding tools like git, or text editors to update the lessons.
            - It supports the single player and multiplayer use cases.
            - Markdown file with lessons separated by dividers: ‘—-’
            - Can create lessons in any directory and they are all added in, with the path.
                - Allows you to better organize your knowledge if you have hundreds of lessons. Makes it easier for you to find and update stuff.
            - Users will rapidly iterate to create the best knowledge. It’s basically prompt engineering lol
                - What about lessons within the code? A long comment that can be added to knowledge.
        - Potentially just called `knowledge.md`, so every application can use it and update it.
            - Wait, this is very similar to README.md!
                - But also, it’s not for exactly the same purpose. It’s for the machine. I think that means it could be worth having it’s own file.
            - Could just give up on discrete lessons, and have the llm update the knowledge file for you in markdown. Hierarchical info is better anyway, with the headings.
                - Track your progress by the number of characters of knowledge instead!
        - Manicode is good at editing files!
        - `knowledge.md` files should be created in the relevant directory for the info.
            - Manicode will edit your .gitignore to include them (if you startup without any pre-existing knowledge files), but recommend you actually commit them.
                - Or, maybe it won’t. Because knowledge files are such a good idea.
        - Manicode should not ask, it should just add knowledge whenever it feels like. That’s an even better experience.
        - You can run manicode from any directory, and it only sees inside the directory it is run from.
            - E.g. if you want to cd into backend to reduce the scope of what it can see and change
        - To start, there’re no user settings. No saved data. You pay a subscription which limits your usage per month.
        - We should prompt manicode to freely edit knowledge files when it learns something. You can just tell it it did something wrong and it will unprompted add knowledge. You of course review the changes as file diffs.
            - It can use a tool call? Or, nope, it just adds knowledge files and edits them all the time.
        - You put in a credit card. It charges based on usage. $20 at a time. It emails you when it charges again. No subscription plan! Just pay for what you use, man.
            - Simply charge 2x of what anthropic charges. Done.
            - Subscriptions are annoying and are stealing from you when you don’t use it all.
            - Alternately, you get a bill at the end of the month and pay then. That’s what cloud compute companies do. This is a better user experience. Maybe with a one-time activation fee ($10).
        - Signup is email & credit card
            - You get a private key which you use to bill your credit card. Can spread among your team. Or regenerate it.
- [ ]  Npm package
    - Install -g manicode and run it in manifold codebase
    - Host a prod server
- [ ]  Add postgres

## Ideas

- Use “tools” to have the llm able to ask for a file, we send it to our server, and then add it to the claude call’s context, and continue generating
- Console application can turn off canonical mode (I think that’s what it was?) and then accept more rich input
- Effort modes: 1 minutes, 15 minutes, 2 hours
    - Response instantly, or work hard to come up with good design and a fuller implementation
- Use [Greptile](https://www.greptile.com/) to index the code base and ask it knowledge questions to become context
- Focus on learning after usage and ask for how to do better
    - Explicitly ask the user to list out separate lessons. Have gpt compile the learnings with the rest of the context to produce knowledge entries
        - Enter up to 3 lessons
    - Tell them this is how it will improve. It won’t make the mistake again! (probably)
    - Show ‘x%’ rating toward becoming a seasoned engineer, and increase it with every bit of knowledge (Every percent is one piece of knowldge)
        - “5% trained - Junior engineer”
        - Give a new title every 10%. After 100%, keep giving new titles on larger intervals
        - New idea: 1% per commit to a knowledge file
- Viral
    - Share manicode rank
    - Share wins: Your prompt, and the result
    - Refer friends. Get $15 credit each



Wish list
- Give the assistant full command of the terminal so it can run stuff like `yarn add` or `git commit`
- Use the up and down arrow keys to scroll through previous messages. Use escape to show menu, and keys to navigate (e.g. to create a new chat, exit, etc.)
- Add a rigorous testing suite to make sure each prompt is working as intended across many cases.
- Save conversations locally in a file. Maybe .manicode? Include a setting for setting the root directory (and thus defaulting to running manicode in that directory so it can always see the whole project)?
