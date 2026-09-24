# Discord Interaction Manager
Are you always fed up with creating interactions by hand or developing your own tools to deploy, update, or delete a slash command or a context menu ?
Same thing when listing interactions — because it’s a mess with specific guild interactions and global interaction ? You never know which one is where or which permission it have ? This tool is made for you !
Discord Interaction Manager is a lightweight CLI tool to manage Discord bot interactions (slash commands, context menus) in under 10 seconds. Generate, deploy, list, update, delete, your interactions with an interactive terminal interface.

✨ Features

    📡 Interaction Management: List, deploy, update, delete global/guild commands & context menus

    ⚙️ File Generation: Interactive JSON generators for slash commands & context menus

    🔍 Guild Discovery: Auto-detect all guilds + interaction counts per guild

    🎛️ Interactive CLI: Rich menus, input validation, interaction selection

    📦 Only one runtime deps: Only discord.js is required in production
    
    🛡️ Never deprecated: Uses discord.js for all Discord requests and enum, always up-to-date with Discord API


> This documentation assume that you know how interactions are built on Discord, if not, please see :
> - [Overview](https://docs.discord.com/developers/interactions/overview)
> - [Receiving and responding](https://docs.discord.com/developers/interactions/receiving-and-responding)
> - [Application Commands](https://docs.discord.com/developers/interactions/application-commands)
>   - [Slash Commands](https://docs.discord.com/developers/interactions/application-commands#slash-commands)
>   - [User Commands](https://docs.discord.com/developers/interactions/application-commands#user-commands)
>   - [Message Commands](https://docs.discord.com/developers/interactions/application-commands#message-commands)

### ⚠️ Unsupported Interaction
    -  Discord Component are not supported, because it's not a static thing register on Discord.
    -  Discord "Activities" are not supported, because it's a complete game feature.

## Quick Start
```bash
npm install @spatulox/discord-interaction-manager
```

### Env variables :
You can use dotenv or set them by hand
```
DISCORD_BOT_TOKEN="" // Discord Bot Token
DISCORD_INTERACTION_FOLDER="" // Optionnal, redirect where the generated interactions files are stored
DISCORD_BOT_DEV (optional)
 * Set to `true` to enable **development mode**. This switches:
 * - Command files: `./handlers/commands/` → `./handlers/commands_dev/`
 * - Context Menu files: `./handlers/context_menu/` → `./handlers/context_menu_dev/`
 * Use the dev ENV to use dev interaction and change them as you like before setting them in you prod env
 * Avoid overwriting you interaction IDS on your prod interactions, IDS are used to update the interaction, if you overwrite them, it will be a new interaction

```

## Run the tool
> If your using a standard console or VSCode, type "npx dim" :
> ```bash
> npx dim
> ```
> If your using Webstorm, use the Webstorm console and type "dim" :
> ```bash
> dim
> ```
> ("dim" stands for DiscordInteractionManager)

You will be greet by a CLI :
```
💠 Discord Interaction Manager CLI
════════════════════════════════════════
1. Manage Interactions
2. Generate Files
3. Help
4. Exit
════════════════════════════════════════
Choose an option: 
```

# How it works
## Creating an interaction
> - You can generate slash commands and context menu with the cli

> - When generating files with the cli, you should be able to see generated files in the "**./handlers**"*

## Deploy an interaction
> - Once you have deployed an interaction, you can update/delete it using the cli

> - The scope** of the interaction is determined while generating the file

## List interactions
> - List global interaction 

> - List spcific interaction for a guild
 
> - List all interactions (global and specific for a guild
  
> - Count the number of interaction by scope**

> - Save global commands in json files

## Update an interaction
> - You can update any interaction, by updating the generated file inside the "**./handlers**" folder*

> - Once you updated the generated file, you can use the cli to update the interaction on Discord

> - If you want to change the scope** :
>   - You have two field : command_scope & id
>     - command_scope can be "global" ou "guild",
>     - "id" can have two forms depending on "command_scope" :
>       - id: {Record<guildId, interactionId | null>} (command_scope = "guild")
>       - id: string (command_scope = "global")
      
>   - **Normal update will not work**

> - If you want to update the permission of the interaction, you need to update the "**default_member_permissions_string**" field with the keyof **PermissionBitFields** of discordjs (or let it empty for everyone), it will automatically update the "**default_member_permissions**" field required by Discord

> - If the "**default_member_permissions_string**" field doesn't exist for some reason, you can create it or go to the [Discord Dev potal](https://discord.com/developers/applications/), in any of your app, go to the "Bot" tab and then check any of the "BotPermission" you want for the interaction and then copy the "Permission Integer" to paste it inside the "**default_member_permissions**" field inside the json of the interaction 

## Delete an interation
> - You can delete any interaction, in any scope**

Key:
* *Folder at the root of your project, if not, make sure you didn't overwrite the path with the DISCORD_INTERACTION_FOLDER variable
* **Scope refer to "global" or "guild specific"