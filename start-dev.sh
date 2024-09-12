#!/bin/bash

# Function to check if the server is running
check_server() {
    nc -z localhost 4242
}

# # Check if the user wants VSCode
# if [ "$1" = "--vscode" ]; then
#     # AppleScript to open VSCode, create terminals, and run commands
#     osascript <<EOF
#     tell application "Visual Studio Code"
#         activate
#         delay 1
#         tell application "System Events"
#             keystroke "j" using {command down, shift down}
#             delay 1
#             keystroke "t" using {command down, shift down}
#             delay 1
#             keystroke "cd $PWD && bun run dev:start-server"
#             delay 1
#             key code 36
#             delay 1
#             keystroke "t" using {command down, shift down}
#             delay 1
#             keystroke "cd $PWD && bun run dev:start-client"
#             delay 1
#             key code 36
#         end tell
#     end tell
# EOF
#     echo "VSCode terminals opened and commands executed."
#     exit 0
# fi

osascript -e 'tell app "Terminal" to do script "cd '"$PWD"' && bun run start-server"'

echo "Waiting for server to start..."
while ! nc -z localhost 4242; do
  sleep 5
done

# Start the client
osascript -e 'tell app "Terminal" to do script "cd '"$PWD"' && bun run start-client"'

echo "Server and client started in separate terminal windows."
# echo "If you prefer to use VSCode terminals, run this script with the --vscode flag."