# Contributing

How to use the CLI is documented in the [wiki](https://github.com/spatulox-discord/DiscordInteractionManager/wiki). This file is about working on its code.

## Setup

```bash
git clone https://github.com/spatulox-discord/DiscordInteractionManager.git
cd DiscordInteractionManager
npm install
cp .env.example .env   # then set DISCORD_BOT_TOKEN
```

Use a test bot: the CLI really creates, updates and deletes interactions.

The CLI runs on Node 18.17+, but the tests need **Node 21 or newer** (`npm test` passes a glob to `node --test`, expanded by Node since 21). `devEngines` in `package.json` makes npm warn you on an older Node.

## Scripts

| Script | What it does |
|---|---|
| `npm run build` | Bundles `src/cli/MainCLI.ts` into `dist/MainCLI.js` with tsup (CommonJS, minified). Dependencies stay external. |
| `npm run cli` | Runs the built CLI. |
| `npm run dev` | Build, then run. |
| `npm test` | Runs every `src/**/*.test.ts` with `node:test` and `tsx`. Needs Node 21+. |
| `npm run type-check` | `tsc --noEmit`. |
| `npm run pub:patch` / `pub:minor` / `pub:major` | Bumps the version and publishes on npm (maintainer only). |

`prepublishOnly` runs the type check, the tests and the build before every publish. Only `dist/` is published (`files` in `package.json`).

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main` and every pull request:

1. On Node 22: `npm ci`, the type check, the tests and the build.
2. On Node 18, 20, 22 and 24: the built CLI is started without token, and must exit with `Missing environment variable : DISCORD_BOT_TOKEN`. This checks that the published bundle and its dependencies load on every supported Node version.

## Code structure

```
src/
├── Env.ts                          environment variables (token, dev mode, folder)
├── type/FolderName.ts              folder names: commands, context_menu
├── utils/
│   ├── DiscordRegex.ts             snowflake and command name regexes
│   ├── FileManager.ts              JSON read/write, safe file names
│   ├── Log.ts                      timestamped logs
│   └── PathUtils.ts                builds <folder>/<type>[_dev] paths
└── cli/
    ├── MainCLI.ts                  entry point (bin "dim"), fetches the application, main menu
    ├── BaseCLI.ts                  menu loop, help, back navigation
    ├── GuildSelector.ts            lists the bot guilds (paginated) and asks for one
    ├── type/InteractionType.ts     types of the local files and Discord enums
    ├── enum/Listing.ts             which local files to list (deployed / local)
    ├── utils/
    │   ├── Prompt.ts               readline prompts (required input, yes/no)
    │   └── Utils.ts                index lists, permission names <-> bitfield
    ├── interactions/
    │   ├── BaseInteractionManager.ts   list / deploy / update / delete, file sync
    │   ├── InteractionManager.ts       CommandManager (type 1), ContextMenuManager (types 2, 3)
    │   ├── InteractionDetails.ts       details view printed after a listing, type and permission labels
    │   ├── InteractionPayload.ts       file <-> Discord payload, permissions resolution
    │   └── InteractionValidator.ts     local file validation
    ├── InteractionCLI/             "Manage Interactions" menus
    │   ├── InteractionCLI.ts           Command / ContextMenu manager choice
    │   ├── InteractionManagerCLI.ts    Global / Guild / All guilds scope choice
    │   ├── ScopeInteractionCLI.ts      deploy / update / delete / save / details shared by the scope menus
    │   ├── GlobalInteractionCLI.ts     Global menu
    │   ├── GuildInteractionCLI.ts      Guild menu, bound to one guild
    │   └── AllGuildsInteractionCLI.ts  All guilds menu, guild interactions in every guild
    └── GenerationCLI/              "Generate Files" menus and generators
```

Main flows:
- **Menus**: every screen extends `BaseCLI` and declares a `menuSelection` list. An action returns a new `BaseCLI` (sub menu), `BACK`, `NO_PAUSE` (the action already waited for the user, skip "Press Enter to continue"), or runs a task.
- **Discord calls**: `@discordjs/rest` with the routes of `discord-api-types/v10`. No gateway connection, no `discord.js`.
- **Payload**: `InteractionPayload.toDiscord` keeps only the Discord fields and computes the permissions; `toDiscordPatch` adds the reset values for update; `fromDiscord` turns a Discord interaction into the local format.

## Guidelines

- Add or update the tests next to the file you change (`*.test.ts`).
- Record user visible changes in `CHANGELOG.md`.
- Update the [wiki](https://github.com/spatulox-discord/DiscordInteractionManager/wiki) when a behavior changes: describe the new behavior, and move the old one into a `<details>` block with the version range. Keep in these blocks only the old behaviors that change what a user must do, the rest belongs in `CHANGELOG.md`.
