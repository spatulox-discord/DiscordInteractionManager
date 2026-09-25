# Contributing

How to use the CLI and the web UI is documented in the [wiki](https://github.com/spatulox-discord/DiscordInteractionManager/wiki). This file is about working on its code.

## Setup

```bash
git clone https://github.com/spatulox-discord/DiscordInteractionManager.git
cd DiscordInteractionManager
npm install
cp .env.example .env   # then set DISCORD_BOT_TOKEN
```

Use a test bot: the CLI and the web UI really create, update and delete interactions.

The CLI runs on Node 18.17+, but the tests need **Node 21 or newer** (`npm test` passes a glob to `node --test`, expanded by Node since 21). `devEngines` in `package.json` makes npm warn you on an older Node.

## Scripts

| Script | What it does |
|---|---|
| `npm run build` | Bundles `src/cli/MainCLI.ts` into `dist/MainCLI.js` with tsup (CommonJS, minified), and copies the page of the web UI (`src/web/public`) into `dist/public`. Dependencies stay external. |
| `npm run cli` | Runs the built CLI. `npm run cli -- web` runs the built web UI. |
| `npm run dev` | Build, then run. |
| `npm test` | Runs every `src/**/*.test.ts` with `node:test` and `tsx`. Needs Node 21+. |
| `npm run type-check` | `tsc --noEmit`. |
| `npm run pub:patch` / `pub:minor` / `pub:major` | Bumps the version and publishes on npm (maintainer only). |

`prepublishOnly` runs the type check, the tests and the build before every publish. Only `dist/` is published (`files` in `package.json`).

To work on the web UI without building, run it from the sources:

```bash
npx tsx src/cli/MainCLI.ts web
```

It serves `src/web/public` as it is: reload the page after editing a file of the page. A change of the server (`src/web/*.ts`, the managers) needs a restart, which prints a new URL (new session token).

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
│   ├── Log.ts                      timestamped logs, captured per request of the web UI
│   ├── Mutex.ts                    runs async functions one after the other
│   └── PathUtils.ts                builds <folder>/<type>[_dev] paths
├── web/                            local web UI ("dim web", "Open Web UI")
│   ├── WebServer.ts                node:http server: static page + JSON API over the managers
│   ├── Router.ts                   "/api/:kind/..." routes, JSON body and answers, HttpError
│   ├── openBrowser.ts              opens the URL in the default browser
│   └── public/                     the page, served as is (no build step, no dependency)
│       ├── index.html, style.css
│       ├── api.js                  fetch with the session token, messages of each answer
│       ├── dom.js                  h() element builder, confirmation dialog
│       ├── app.js                  lists, scopes, actions, log, details drawer, editor window
│       └── builder.js              builder of the interaction files
└── cli/
    ├── MainCLI.ts                  entry point (bin "dim"), fetches the application, main menu
    ├── BaseCLI.ts                  menu loop, help, back navigation
    ├── GuildSelector.ts            lists the bot guilds (paginated) and asks for one
    ├── type/InteractionType.ts     types of the local files and Discord enums
    ├── enum/Listing.ts             which local files to list (all / deployed / local / addable)
    ├── utils/
    │   ├── Prompt.ts               readline prompts (required input, yes/no)
    │   └── Utils.ts                index lists, permission names <-> bitfield
    ├── interactions/
    │   ├── BaseInteractionManager.ts   list / deploy / update / delete, file sync
    │   ├── InteractionManager.ts       CommandManager (type 1), ContextMenuManager (types 2, 3)
    │   ├── InteractionDetails.ts       details view printed after a listing, type and permission labels
    │   ├── InteractionPayload.ts       file <-> Discord payload, permissions resolution
    │   ├── InteractionRules.ts         Discord rules (names, options, choices, limits) shared by the generators and the web builder
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
- **File changes**: deploy, update and delete read the files and write their IDs back. They run one at a time through `BaseInteractionManager.fileChanges`, with the saves and deletions of the web UI, so two of them never write a file from what it was before the other. The lock is in memory: it covers the CLI and the web UI opened from it, not two separate processes.

### Web UI

- **Server**: `WebServer` uses `node:http`, without framework. It serves `public/` and a JSON API that calls the same managers as the CLI (`CommandManager`, `ContextMenuManager`), so the rules and the file sync are the CLI ones. The routes are declared in `WebServer.addRoutes`, `:kind` being a folder name (`commands`, `context_menu`).
- **Security**: it only listens on `127.0.0.1`. Every `/api/` request needs the session token of the printed URL in the `X-DIM-Token` header (a custom header, so another website cannot send it without a CORS preflight, which the server never allows), and a `Host` of `127.0.0.1` or `localhost` (DNS rebinding). The static files are sent with a `default-src 'self'` CSP.
- **Messages**: `Log.capture` runs a request and collects what `Log` prints instead of writing it to the terminal. Every answer is `{data, messages}` (or `{error, messages}`), and the page shows the messages in its Log panel. Use `Log` rather than `console` in the managers, so the web UI sees the messages.
- **Page**: plain ES modules loaded by the browser. `h()` builds the elements and never parses HTML: do not use `innerHTML`. `app.js` keeps the state of the page in one `state` object and renders the tables again from it.
- **Builder**: it edits a copy of the file, and `output()` is the JSON that will be saved (the preview, the unsaved changes and the save all use it). The server checks it again with `InteractionRules.validateForSave`, through `POST /api/:kind/validate` while editing and `PUT /api/:kind/files/:filename` when saving, and keeps the IDs of the existing file (`WebServer.keepIds`).

## Guidelines

- Add or update the tests next to the file you change (`*.test.ts`). The API of the web UI is tested in `src/web/WebServer.test.ts`, with the Discord calls mocked. The page has no automated tests: check it in a browser (`npx tsx src/cli/MainCLI.ts web`) with a test bot.
- A Discord rule belongs in `InteractionRules`, used by the generators and the server. `builder.js` repeats the ones it needs to guide the user (allowed option types, required options first, limits): keep them in sync.
- The page has no dependency and no build step: keep it that way, the package is installed in the projects of its users.
- Record user visible changes in `CHANGELOG.md`.
- Update the [wiki](https://github.com/spatulox-discord/DiscordInteractionManager/wiki) when a behavior changes: describe the new behavior, and move the old one into a `<details>` block with the version range. Keep in these blocks only the old behaviors that change what a user must do, the rest belongs in `CHANGELOG.md`.
