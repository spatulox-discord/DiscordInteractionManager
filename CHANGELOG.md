# Changelog
Date format : dd/mm/yyyy

### Unreleased
- Add :
    - Tests with `node:test` + `tsx` (`npm test`), and a `prepublishOnly` script running the type check, the tests and the build before each publish
    - Autocomplete can be enabled on `INTEGER` and `NUMBER` options, not only on `STRING` ones. As for strings, choices are skipped when autocomplete is on
    - `NUMBER` options can have choices
    - `engines` : Node `>=18.17`, required by `undici` (used by `@discordjs/rest`)
    - The optional variables (`DISCORD_INTERACTION_FOLDER`, `DISCORD_BOT_DEV`) are documented in `.env.example`
    - Stage channels (`13`) can be chosen in the channel types of a `CHANNEL` option
    - After a listing, the numbers of the table show the details of the interactions : scope and IDs, permissions, contexts, integration types, NSFW, localizations, local file, and the options as a tree (types, required, limits, autocomplete, channel types, choices). "List all available" in the Guild menu now prints one table (the GuildID column tells global interactions apart)
    - An "All guilds" menu next to Global and Guild : lists each guild interaction with the number of guilds it is deployed in (from Discord, with its local file and details), counts interactions per guild, updates guild interactions in all their guilds and deletes them from every guild (even without local file)
    - Local files are checked when read : guild IDs (keys of `id`) and interaction IDs must be Discord IDs, so a mistyped ID is reported with the file name instead of failing on Discord. The empty global `"id": ""` written by older generators is still accepted
    - "Add a guild ... to this guild" in the Guild menu : deploys a guild interaction to a guild it does not target yet, and adds the guild with its new ID to the local file
    - Deleting interactions asks for a confirmation that names them
    - A warning when two local files define the same interaction in the same scope (Discord keeps only one, and both files would get the same ID)
    - The All guilds menu shows how many guilds are fetched, for bots in many guilds
- Change :
    - `DISCORD_BOT_CLIENTID` is no longer needed : the application ID is fetched from Discord with the token (`GET /applications/@me`)
    - `discord.js` is no longer needed : the CLI only depends on `@discordjs/rest` and `discord-api-types`, now declared as dependencies (they were only installed through `discord.js`, which broke with pnpm / Yarn PnP)
    - Unknown fields of the local files (`name_localizations`, comments...) are kept, and the payload sent to Discord only contains Discord fields, so `command_scope`, `id`, `filename`... are no longer sent on POST / PATCH
    - Updating an interaction resets the fields removed from the local file (`options`, `nsfw`, `contexts`, localizations, permissions), since Discord's PATCH only edits the fields it receives
    - `DISCORD_BOT_DEV` only enables the dev mode when set to `true` or `1` (`false` used to enable it)
    - Only the local files whose name starts with `example` are ignored (any name containing `example` was). The rule is shown in the help
    - The generators no longer ask for the deprecated `dm_permission` (replaced by `contexts`), and the contexts / integration types steps are optional : leaving them empty keeps Discord's default
    - Slash command and option names accept any lowercase unicode letter (e.g. `liber-thé`), using Discord's name regex
    - The slash command generator enforces Discord's option rules : subcommand groups only contain subcommands and need at least one, subcommands never contain subcommands, neither are mixed with regular options, `required` is no longer asked for subcommands, required options are placed first, option names are unique, 25 options at most
    - Stricter inputs : numeric limits are validated (lengths between 0 and 6000, `INTEGER` limits are integers, maximum never below minimum), partially numeric indices (`1abc`, `1.5`) are rejected, duplicated indices are selected once, an out of range number rejects the whole selection instead of being dropped, generated file names cannot contain path separators
    - Missing configuration or an invalid token print a short message and exit instead of a stack trace or continuing as "Unknown Bot"
    - A failing menu action reports the error and the CLI keeps running
    - Menus loop instead of calling each other recursively, and an invalid choice prints "Invalid choice"
    - Each permission is listed once (deprecated aliases such as `ManageEmojisAndStickers` are hidden, but still accepted in local files)
    - Only `dist` is published on npm (`files` whitelist instead of `.npmignore`)
    - The CLI class hierarchy is simplified (`Prompt` helper, `GuildListManager` becomes `GuildSelector`)
    - The Command and ContextMenu managers start with a Global / Guild choice. Global only handles global interactions (deploying no longer deploys guild files, updating no longer updates every guild). Guild asks for the guild once and every action only applies to it. The separate List menu and the "y=global/n=specific" questions are gone, guild interactions saved from Discord go to `generated_<folder>/<guildId>/`, and "Count per guild" is in the All guilds menu
    - The generators list the guilds of the bot for a guild interaction and take their numbers (raw guild IDs were asked). Leaving it empty keeps a guild interaction with no guild yet, to add later from the Guild menu, instead of turning it into a global one
    - An invalid selection of interactions asks again instead of cancelling the action, and leaving it empty cancels it
    - Local files are written to a temporary file first, so a crash or a full disk can no longer leave a truncated file and lose its IDs
    - Local files are also checked for the structure of `options` (type, name, description, with the path of the invalid option), `contexts`, `integration_types` and `nsfw`, instead of failing on Discord
    - Every yes / no prompt shows `(y/n)` in the same way (some had no hint or no space before the answer)
    - The name column of the tables is called "Name" (it was "Nom")
    - The generators trim the descriptions and choice names, and ask again when they are blank (e.g. only spaces)
    - The generator refuses choices with a name or a value already used, or outside the limits of their option (`min_value` / `max_value`, `min_length` / `max_length`)
    - Typing `exit` quits the CLI from any menu (it only went back to the previous menu), and the menu prompt mentions it
- Fix :
    - Administrators only commands (`default_member_permissions: "0"`) saved from Discord became public once deployed again
    - The channel types `10` (announcement thread) and `11` (public thread) had their labels swapped in the generator
    - Context menus are never sent with a description or options (Discord rejects them)
    - "Save global ... into local file" dropped the options, the `nsfw` flag and the localizations of slash commands
    - A failed deletion on Discord still removed the ID from the local file
    - `update()` stopped at the first command without a readable local file
    - A guild update without a selected guild fell back to a global update, and one failing guild aborted the update for every guild. The guilds whose update failed are now reported
    - Bot and guild IDs of 17, 18 or 20 digits were rejected : bots with an 18 digit ID could not start, and 18 digit guild IDs were silently dropped by the generator
    - `INTEGER` and `NUMBER` choice values were saved as strings, which Discord rejects
    - Folders given as absolute paths could not be created (`ENOENT`)
    - Bots in more than 200 guilds only saw the first 200
    - "Y" / "YES" were accepted but read as "no" in yes / no prompts
    - "ALL" in upper case produced `[NaN]` in the generator prompts
    - The integration types step checked the contexts list
    - "File saved" was printed even when the write failed, and saving a new file logged "[ERROR] Failed to read JSON file"
    - Global interactions were generated with an empty `id`
    - A context menu name made of spaces passed the generator checks
    - Saving remote interactions used the raw name as filename : a `/` broke the path, and a user and a message context menu with the same name overwrote each other
    - Guild commands deployed nowhere were listed as deployed (with an empty ID)
    - Messages : "deleted for undefined" for global commands, one header per guild when counting, the scope instead of the guild ID in guild listing errors, the step numbering of the slash command generator, the message shown at 25 choices, the out of range permission index was accepted
    - dotenv no longer prints its advertising tip on every run
    - A local file with an invalid `default_member_permissions` (e.g. `"abc"`) emptied the whole listing : the file is now reported and skipped
    - Interactions saved from Discord with a permission unknown to `discord-api-types` (added recently by Discord) lost it once updated, and could become usable by everyone : their permission names are no longer saved, only the bitfield. The details show these permissions as `Unknown (<bit>)`
    - An unknown permission name in `default_member_permissions_string` (e.g. a typo) was skipped with a warning, restricting the interaction to administrators when it was the only one, and names such as `constructor` crashed : the file is now reported
    - A context menu file in `commands/` (or a slash command in `context_menu/`) was deployed by the wrong manager, which then never listed it from Discord nor cleaned its ID once deleted : such a file is now reported and skipped
    - Deleting an interaction read the `example*` files while cleaning the local IDs, and reported the invalid ones
    - The generators accepted a file name starting with `example`, so the generated file was silently ignored
    - The details showed an empty ID instead of "not deployed" for the `"id": ""` of older generators
- Remove :
    - Unused regexes (some of them were wrong) and the duplicated `DiscordCommandType` enum

### 16/05/2026 - 2.0.7
- Change :
    - `discord.js` is now a peer dependency and is no longer bundled in the build
    - The CLI is named "Discord Interaction Manager CLI" (was "SimpleDiscordBot CLI"), and the GitHub links point to the new repository
- Fix :
    - Context menus no longer get a default "Context menu" description, which Discord rejects

### 07/04/2026 - 2.0.6
- Change :
    - Guild commands already deployed in every target guild are skipped when listing local interactions

### 07/04/2026 - 2.0.5
- Fix :
    - The options of a generated slash command were not saved in the file

### 07/04/2026 - 2.0.4
- Change :
    - Update lodash to 4.18.1

### 07/04/2026 - 2.0.3
- Fix :
    - The slash command generator crashed when a command had no options

### 01/04/2026 - 2.0.2
- Change :
    - Update discord.js to 14.26.0 (security fix) and its dependencies

### 25/03/2026 - 2.0.1
- Add :
    - Validation of the local interaction files : malformed slash commands and context menus are no longer loaded
- Change :
    - The save action states that it saves the global interactions
- Docs :
    - Listing of every interaction (global and guild specific), saving global interactions, how to change the scope of an interaction

### 18/03/2026 - 2.0.0
Not published on npm, released as 2.0.1
- Change (breaking) :
    - New local file format for guild commands : the `guild_ids` array is replaced by an `id` record (`{ "guildId": "commandId" | null }`) and a `command_scope` field (`global` / `guild`). A single local file can be deployed to several guilds, and the deployment is tracked per guild (`null` = not deployed yet)
    - Only the guilds where a command is not deployed yet are shown in the local listing, and fully deployed commands are excluded from it
    - Update and delete handle the new ID structure and keep the existing IDs on update

### 18/03/2026 - 1.1.0
- Add :
    - Guild commands can be deployed to several guilds, with one command ID per guild
    - "List" on a guild shows the global interactions and the ones dedicated to that guild, and a separate "Count" action counts the interactions of every guild
- Change :
    - Deployed and local interactions are told apart from their Discord ID, and update only offers the deployed ones
    - Full guild names are shown in the update and error messages instead of the IDs

### 18/03/2026 - 1.0.23
- Add :
    - The generators ask for the integration types (Guild Install, User Install)
- Change :
    - Same save flow for every generator : the context menu generator asks for the filename, and the filename is asked again if the existing file is not overwritten
    - Update dependencies

### 20/02/2026 - 1.0.22
- Change :
    - Update discord.js to 14.25.1

### 18/02/2026 - 1.0.21
- Add :
    - Save the remote interactions into local JSON files
- Change :
    - Deploy relies on Discord's upsert instead of checking the existing commands first
    - Commands fetched from Discord include their contexts and integration types
- Fix :
    - Commands without permissions no longer fail : a default value is used, and the permission names are converted to a bitfield
    - The permission list is checked to be an array

### 18/02/2026 - 1.0.20
- Change :
    - Local files use `guild_ids` instead of `guildID`, and have a `dm_permission` field, to match the Discord API

### 18/02/2026 - 1.0.19
- Add :
    - The bot name is shown in the main menu

### 18/02/2026 - 1.0.18
- Fix :
    - Guild commands could not be deleted, only global ones
    - Guild commands were updated with the global route
    - Commands were deleted twice

### 17/02/2026 - 1.0.17
- Add :
    - The generators ask for the contexts where an interaction is available
- Change :
    - Global commands show "Global" in the GuildID column

### 17/02/2026 - 1.0.16
- Add :
    - The guild ID is shown in the command list
- Change :
    - Local files containing "example" in their name are not deployed
    - `DISCORD_BOT_DEV` is optional
    - Clearer prompt when selecting commands

### 16/02/2026 - 1.0.15
- Add :
    - `DISCORD_BOT_DEV` : dev mode, the interactions are read from and written to `commands_dev` / `context_menu_dev`, so a dev bot can be worked on without overwriting the IDs of the prod interactions. The variable is required in this version

### 13/02/2026 - 1.0.14
- Change :
    - dotenv is back as a dependency, the `.env` file is loaded automatically

### 13/02/2026 - 1.0.13
- Fix :
    - The `dim` command pointed to the old build path
- Remove :
    - dotenv

### 13/02/2026 - 1.0.12
- Change :
    - Built with tsup into a single minified file

### 11/02/2026 - 1.0.11
- Docs :
    - How to update the permissions and the scope of an interaction

### 11/02/2026 - 1.0.10
- Docs :
    - Better project description in the README

### 11/02/2026 - 1.0.9
- Docs :
    - Discord Components and Activities are not supported

### 11/02/2026 - 1.0.8
1.0.7 was never published on npm
- Change :
    - The help shows the new project name "DiscordInteractionManager", with its wiki and issue tracker links
    - Repository and bug tracker links in `package.json`

### 11/02/2026 - 1.0.4 → 1.0.6
- Republished, no change in the code

### 11/02/2026 - 1.0.3
- Add :
    - NSFW flag in the generators
    - `DISCORD_INTERACTION_FOLDER` : where the interaction files are stored (default `./handlers`)
    - Update and delete can select the commands from the local files or from Discord, globally or for a guild
    - The local listing can include the already deployed commands, and can be filtered by guild
- Change :
    - Update sends the complete command and saves the result into the local file
- Fix :
    - `default_member_permissions` was built from the raw input instead of the selected permissions

### 11/02/2026 - 1.0.2
- Change :
    - The slash command generator shows the minimum and maximum of each option type, and the 25 choices limit
    - The `handlers` folder and unused dev dependencies are no longer published

### 11/02/2026 - 1.0.1
- Change :
    - The generators share the same permissions (with `everyone`) and guild IDs (comma separated, or `none`) prompts
    - Cleaner interaction listing
- Fix :
    - A file ending with `.json` was not found when checking if it already existed
- Remove :
    - Modal generator

### 11/02/2026 - 1.0.0
- Add :
    - `dim` : interactive CLI to manage the slash commands and context menus of a Discord bot, with `DISCORD_BOT_TOKEN` and `DISCORD_BOT_CLIENTID`
    - List the interactions from Discord, globally or for a guild, with their permissions, and count them for every guild
    - Deploy, update and delete interactions from local JSON files. The local ID of a deleted command is removed from its file
    - Generators for slash commands (options, choices, subcommands and groups), context menus and modals
    - Permissions written by name in `default_member_permissions_string`
    - `exit` to go back to the previous menu, and a help menu
