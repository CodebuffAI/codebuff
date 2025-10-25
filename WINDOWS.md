## Codebuff for Windows dev setup

Welcome!

For development, we have a shared windows machine, via shadow.tech.

### Accessing the machine

You can access the machine either from the browser or with the desktop app:

1. Shadow.tech Web viewer:

- Go to https://pc.shadow.tech/home

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

---

## Common Windows Issues & Troubleshooting

Running into problems? Here are solutions to the most common Windows-specific issues.

### Issue: "Failed to determine latest version" on First Run

**Symptom**:
```powershell
PS C:\> codebuff
❌ Failed to determine latest version
Please check your internet connection and try again
```

**Cause**:
Codebuff checks GitHub for the latest release on first run. This fails when:
- Corporate firewall blocks `github.com`
- Proxy settings not configured
- Network connectivity issues
- VPN required for external access

**Solutions**:

1. **Verify GitHub access**:
   ```powershell
   curl https://github.com/CodebuffAI/codebuff/releases.atom
   ```
   If this fails, you have a network/firewall issue.

2. **Configure npm proxy** (if behind corporate proxy):
   ```powershell
   npm config set proxy http://your-proxy-server:port
   npm config set https-proxy http://your-proxy-server:port
   ```

3. **Disable VPN temporarily** or whitelist GitHub in your firewall

4. **Clear npm cache and reinstall**:
   ```powershell
   npm cache clean --force
   npm uninstall -g codebuff
   npm install -g codebuff
   ```

**Reference**: Issue [#294](https://github.com/CodebuffAI/codebuff/issues/294)

---

### Issue: Git Commands Fail on Windows

**Symptom**:
Git operations (commit, rebase, complex commands) fail with syntax errors or unexpected behavior.

**Cause**:
Codebuff uses Windows `cmd.exe` for command execution, which:
- Does not support bash syntax (HEREDOC, process substitution)
- Has limited quote escaping compared to bash
- Cannot execute complex git commands that work in Git Bash

**Solutions**:

1. **Install Git for Windows** (if not already installed):
   - Download from https://git-scm.com/download/win
   - Ensures git commands are available in PATH

2. **Use Git Bash terminal** instead of PowerShell:
   - Git Bash provides better compatibility with bash-style commands
   - Launch Git Bash and run `codebuff` from there

3. **Or use WSL (Windows Subsystem for Linux)**:
   - Provides full Linux environment with native bash
   - Install: `wsl --install` in PowerShell (Admin)
   - Run codebuff inside WSL for best compatibility

**Note**: Even when running in Git Bash, Codebuff spawns commands using `cmd.exe`. Using WSL provides the most reliable experience for git operations.

**Reference**: Issue [#274](https://github.com/CodebuffAI/codebuff/issues/274)

---

### Issue: Login Browser Window Fails to Open

**Symptom**:
```
Press ENTER to open your browser and finish logging in...

Caught exception: Error: Executable not found in $PATH: "start"
Error: Executable not found in $PATH: "start"
TLCWeb > Unable to login. Please try again by typing "login" in the terminal.
```

**Cause**:
When running Codebuff in Git Bash (MINGW64), the `start` command is not available in PATH. The browser auto-open feature fails.

**Solutions**:

1. **Manually open the login URL** (easiest):
   - Codebuff displays the login URL after the error
   - Copy the full URL starting with `https://codebuff.com/login?auth_code=...`
   - Paste into your browser
   - Complete login in browser
   - Return to terminal - login will succeed

2. **Use native Windows terminals**:
   - PowerShell: `powershell`
   - Command Prompt: `cmd`
   - These have `start` command available

3. **Clear cache if login still fails** (per issue #299):
   ```powershell
   npm cache clean --force
   npm uninstall -g codebuff
   npm install -g codebuff
   ```

**Reference**: Issue [#299](https://github.com/CodebuffAI/codebuff/issues/299)

---

### Message: "Update available: error → [version]"

**What it means**:
This is **not an error** - it's an informational message indicating:
- Your local binary needs to be downloaded/updated
- "error" is a placeholder version (not a real error state)
- Codebuff will automatically download the correct version

**What to do**:
- Wait for the download to complete: "Download complete! Starting Codebuff..."
- If download fails, check your internet connection
- If it persists, try the solutions in "Failed to determine latest version" above

**Reference**: Issue [#299](https://github.com/CodebuffAI/codebuff/issues/299)

---

### Still Having Issues?

If these solutions don't resolve your problem:

1. **Search existing issues**: https://github.com/CodebuffAI/codebuff/issues
2. **Open a new issue**: https://github.com/CodebuffAI/codebuff/issues/new
3. **Join Discord community**: https://codebuff.com/discord

When reporting issues, please include:
- Windows version: `winver` command
- PowerShell/Git Bash/CMD
- Node version: `node --version`
- Full error message
- Steps to reproduce
