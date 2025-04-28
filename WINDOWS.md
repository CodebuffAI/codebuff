## Codebuff for Windows dev setup

Welcome!

For development, we have a shared windows machine, via Shadow.tech. Additionally, we have a Gmail & Github account - so you can login to Codebuff using those, instead of your personal account, on this shared machine.

### Credentials
- Email: codebuffwindows@gmail.com
- Gmail password: windbuff
- Github password: windbuff1
- Shadow.tech password: Windbuff1! (use email: codebuffwindows@gmail.com)

### Accessing the machine

You can access the machine either from the browser or with the desktop app:

1. Shadow.tech Web viewer: 
- Go to https://pc.shadow.tech/home 
- Login with the above credentials

2. Shadow.tech desktop app:
- They claim its better, idk.
- https://shadow.tech/download/

Supposedly you can also use Window's Remote Desktop to access the machine instead, but I've not tried it. Shadow.tech claims their protocol is better optimized for lower bandwidth use & hence smoother performance.

## Set-up guide:

You shouldn't need this - but just in case you stop using Shadow.tech, or make a new account, here's a guide on how to get from a blank Windows install to a Codebuff install.

Surprisingly: most guides in fact recommend running everything in an Admin PowerShell, contra to advice to not use sudo on eg: Linux/macOS.

- Install Choco: Open PowerShell as Admin, and run the command from https://chocolatey.org/install
- Install NVM: Restart PowerShell (still as Admin) and run `choco install nvm -y`
- Install Node: Restart PowerShell (still as Admin) and run `nvm install node`
- Install Codebuff: Run `npm i -g codebuff`

