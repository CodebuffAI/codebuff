# Debug Data Storage

## Directory Structure

All debug data is stored in `~/.config/manicode/`:

```
~/.config/manicode/
  credentials.json
  projects/                         # Separate user project data
    my-app/                         # Simple name by default
      browser/                      # Browser profile
      chats/
        <chat-id>/                  # datetime when the chat was created
          messages.json
          screenshots/              # Screenshots with chat context
    my-app-a1b2c3d4/                # Add hash based on full path only if name collides
```

## Key Design Decisions

1. **Project Isolation**

   - Each project gets its own directory under `projects/`
   - Project directories use simple name by default (e.g. my-app)
   - Hash suffix only added if name collides with existing project
   - This keeps paths readable while handling conflicts

2. **Chat Organization**

   - Chat IDs include timestamp to prevent overwrites
   - Format: `YYYY-MM-DD_HH-MM-SS_TIMESTAMP_RANDOM`
   - Screenshots stored with their chat context
   - Each chat is self-contained with its own data

3. **Standard Locations**
   - Uses ~/.config for user-specific data (XDG standard)
   - Keeps debug data out of project directory
   - Separates app config from project data
   - Directories automatically created as needed

## Implementation Notes

- Use `getProjectDataDir()` to get project-specific directory
- Use `getCurrentChatDir()` to get current chat directory
- All paths are created on demand via `ensureDirectoryExists()`
- Browser profiles are project-specific for isolation

```

```
