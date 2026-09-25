import http, {IncomingMessage, ServerResponse} from "node:http";
import {AddressInfo} from "node:net";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {PermissionFlagsBits, RESTAPIPartialCurrentUserGuild, RESTGetCurrentApplicationResult} from "discord-api-types/v10";
import {Env} from "../Env";
import {Log} from "../utils/Log";
import {FileManager} from "../utils/FileManager";
import {DiscordRegex} from "../utils/DiscordRegex";
import {PathUtils} from "../utils/PathUtils";
import {BaseInteractionManager} from "../cli/interactions/BaseInteractionManager";
import {CommandManager, ContextMenuManager} from "../cli/interactions/InteractionManager";
import {InteractionPayload} from "../cli/interactions/InteractionPayload";
import {InteractionDetails} from "../cli/interactions/InteractionDetails";
import {InteractionRules} from "../cli/interactions/InteractionRules";
import {InteractionValidator} from "../cli/interactions/InteractionValidator";
import {GuildSelector} from "../cli/GuildSelector";
import {ALL_GUILDS, Listing} from "../cli/enum/Listing";
import {
    ChannelType,
    CommandType,
    DiscordOptionType,
    Interaction,
    InteractionContextType,
    InteractionIntegrationType
} from "../cli/type/InteractionType";
import {FolderName} from "../type/FolderName";
import {Utils} from "../cli/utils/Utils";
import {HttpError, readJson, RouteContext, Router, sendJson} from "./Router";

export const DEFAULT_PORT = 3789;
const MAX_BODY_BYTES = 1024 * 1024;
const TOKEN_HEADER = "x-dim-token";
// The All guilds scope needs the guilds at each refresh: they are listed again after this delay
const GUILDS_TTL_MS = 60_000;

// Next to the bundled dist/MainCLI.js, or next to this file when run with tsx
const PUBLIC_FOLDER = path.join(__dirname, "public");
const CONTENT_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
};

type Guild = RESTAPIPartialCurrentUserGuild;
type Scope = "global" | "guild" | "all";

export type WebServerOptions = {
    token: string;
    application: RESTGetCurrentApplicationResult;
    port?: number;
    // Replaced by the tests
    managers?: Record<FolderName, BaseInteractionManager>;
    fetchGuilds?: () => Promise<Guild[]>;
};

/**
 * Local web UI: serves the page and a JSON API running the same managers as the CLI.
 * It only listens on 127.0.0.1, and every API request needs the session token given in the opened URL,
 * so another website open in the browser can neither read nor change the interactions of the bot.
 */
export class WebServer {
    readonly sessionToken = crypto.randomBytes(24).toString("base64url");
    private readonly server = http.createServer((req, res) => void this.handle(req, res));
    private readonly router = new Router();
    private readonly managers: Record<FolderName, BaseInteractionManager>;
    private readonly fetchGuilds: () => Promise<Guild[]>;
    private guilds: Guild[] = [];
    private guildsListedAt = 0;
    private port = 0;

    constructor(private readonly options: WebServerOptions) {
        const {token, application} = options;
        const integrationTypes = InteractionPayload.defaultIntegrationTypes(application);
        this.managers = options.managers ?? {
            [FolderName.SLASH_COMMANDS]: new CommandManager(application.id, token, integrationTypes),
            [FolderName.CONTEXT_MENU]: new ContextMenuManager(application.id, token, integrationTypes),
        };
        this.fetchGuilds = options.fetchGuilds ?? (() => new GuildSelector(token).fetchAllGuilds());
        this.addRoutes();
    }

    /**
     * Listens on the port of the options, or on a free one when it is already used.
     * @returns the URL to open, with the session token
     */
    async start(): Promise<string> {
        const wanted = this.options.port ?? DEFAULT_PORT;
        try {
            await this.listen(wanted);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE" || wanted === 0) throw error;
            await this.listen(0);
        }
        this.port = (this.server.address() as AddressInfo).port;
        return `${this.origin()}/#token=${this.sessionToken}`;
    }

    close(): Promise<void> {
        return new Promise(resolve => this.server.close(() => resolve()));
    }

    origin(): string {
        return `http://127.0.0.1:${this.port}`;
    }

    private listen(port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.once("error", reject);
            this.server.listen(port, "127.0.0.1", () => {
                this.server.off("error", reject);
                resolve();
            });
        });
    }

    private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
        try {
            // A DNS rebinding page reaches this server with its own host name
            const host = req.headers.host ?? "";
            if (host !== `127.0.0.1:${this.port}` && host !== `localhost:${this.port}`) {
                throw new HttpError(403, "Unknown host");
            }

            const url = new URL(req.url ?? "/", this.origin());
            if (!url.pathname.startsWith("/api/")) {
                await this.serveStatic(req, res, url.pathname);
                return;
            }

            if (!this.hasSessionToken(req)) throw new HttpError(401, "Missing or wrong session token, open the URL printed in the terminal");

            const route = this.router.match(req.method ?? "GET", url.pathname);
            if (!route) throw new HttpError(404, `No route ${url.pathname}`);

            const body = req.method === "GET" ? undefined : await readJson(req, MAX_BODY_BYTES);
            const {result, messages} = await Log.capture(async () => {
                try {
                    return {data: await route.handler({params: route.params, query: url.searchParams, body})};
                } catch (error) {
                    return {error};
                }
            });

            if ("error" in result) throw Object.assign(result.error as Error, {messages});
            sendJson(res, 200, {data: result.data, messages});
        } catch (error) {
            const messages = (error as { messages?: unknown }).messages ?? [];
            if (error instanceof HttpError) {
                sendJson(res, error.status, {error: error.message, ...error.details, messages});
            } else {
                sendJson(res, 500, {error: (error as Error).message, messages});
            }
        }
    }

    private hasSessionToken(req: IncomingMessage): boolean {
        const given = Buffer.from(String(req.headers[TOKEN_HEADER] ?? ""));
        const expected = Buffer.from(this.sessionToken);
        return given.length === expected.length && crypto.timingSafeEqual(given, expected);
    }

    private async serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
        if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Only GET is allowed");

        const relative = pathname === "/" ? "index.html" : pathname.slice(1);
        const filePath = path.resolve(PUBLIC_FOLDER, relative);
        const contentType = CONTENT_TYPES[path.extname(filePath)];
        if (!filePath.startsWith(PUBLIC_FOLDER + path.sep) || !contentType) throw new HttpError(404, "Not found");

        let content: Buffer;
        try {
            content = await fs.readFile(filePath);
        } catch {
            throw new HttpError(404, "Not found");
        }
        res.writeHead(200, {
            "Content-Type": contentType,
            "Content-Length": content.length,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
        });
        res.end(req.method === "HEAD" ? undefined : content);
    }

    private addRoutes(): void {
        this.router
            .add("GET", "/api/app", async () => this.app())
            .add("GET", "/api/meta", async () => WebServer.meta())
            .add("GET", "/api/guilds", async () => (await this.loadGuilds(true)).map(({id, name}) => ({id, name})))
            .add("GET", "/api/:kind/local", context => this.listLocal(context))
            .add("GET", "/api/:kind/remote", context => this.listRemote(context))
            .add("GET", "/api/:kind/count", context => this.count(context))
            .add("POST", "/api/:kind/deploy", context => this.deploy(context))
            .add("POST", "/api/:kind/update", context => this.update(context))
            .add("POST", "/api/:kind/delete", context => this.delete(context))
            .add("POST", "/api/:kind/save-remote", context => this.saveRemote(context))
            .add("GET", "/api/:kind/files/:filename", context => this.readFile(context))
            .add("PUT", "/api/:kind/files/:filename", context => this.writeFile(context))
            .add("DELETE", "/api/:kind/files/:filename", context => this.deleteFile(context));
    }

    private app() {
        const {application} = this.options;
        return {
            name: application.name,
            id: application.id,
            dev: Env.dev,
            folder: Env.interactionFolderPath,
            folders: Object.fromEntries(Object.values(FolderName).map(kind => [kind, PathUtils.createPathFolder(kind)])),
        };
    }

    private static meta() {
        const enumEntries = (enumObject: Record<string, string | number>) => Object.entries(enumObject)
            .filter((entry): entry is [string, number] => typeof entry[1] === "number")
            .map(([name, value]) => ({name, value}));
        return {
            permissions: Utils.permissionEntries().map(([name]) => name),
            // Every name, aliases included, so the builder computes the bitfield as the server does
            permissionBits: Object.fromEntries(Object.entries(PermissionFlagsBits).map(([name, bit]) => [name, bit.toString()])),
            contexts: enumEntries(InteractionContextType),
            integrationTypes: enumEntries(InteractionIntegrationType),
            optionTypes: enumEntries(DiscordOptionType),
            channelTypes: enumEntries(ChannelType),
        };
    }

    // ---- Interactions ----

    private manager(context: RouteContext): BaseInteractionManager {
        const manager = this.managers[context.params.kind as FolderName];
        if (!manager) throw new HttpError(404, `Unknown interaction kind ${context.params.kind}`);
        return manager;
    }

    /**
     * @param fresh true to list them again even when the last listing is recent
     */
    private async loadGuilds(fresh = false): Promise<Guild[]> {
        if (!fresh && Date.now() - this.guildsListedAt < GUILDS_TTL_MS) return this.guilds;
        try {
            this.guilds = await this.fetchGuilds();
            this.guildsListedAt = Date.now();
        } catch (error) {
            throw new HttpError(502, `Cannot list the guilds of the bot: ${(error as Error).message}`);
        }
        return this.guilds;
    }

    // The guild, from the last listing when possible, so the messages show its name
    private async guild(id: unknown): Promise<Guild> {
        if (typeof id !== "string" || !DiscordRegex.GUILD_ID.test(id)) throw new HttpError(400, "A guild ID is required");
        // A guild joined since the last listing is found by listing them again
        const known = this.guilds.find(guild => guild.id === id) ?? (await this.loadGuilds(true)).find(guild => guild.id === id);
        if (!known) throw new HttpError(404, `The bot is not in the guild ${id}`);
        return known;
    }

    private static scope(value: unknown): Scope {
        if (value === "global" || value === "guild" || value === "all") return value;
        throw new HttpError(400, 'The scope is "global", "guild" or "all"');
    }

    private static stringList(value: unknown, field: string): string[] {
        if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== "string")) {
            throw new HttpError(400, `'${field}' must be a non-empty list of strings`);
        }
        return value;
    }

    private static body(context: RouteContext): Record<string, unknown> {
        const {body} = context;
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Expected a JSON object");
        return body as Record<string, unknown>;
    }

    private static withDetails(commands: Interaction[]) {
        return commands.map(cmd => ({
            ...cmd,
            key: `${cmd.type}:${cmd.name}`,
            permissions: InteractionDetails.permissionsLabel(cmd) || "Everyone",
            details: InteractionDetails.format(cmd),
        }));
    }

    /**
     * Local files of a scope, with every guild they target for the guild scope.
     * With listing=addable, the guild files that do not target the guild yet.
     */
    private async listLocal(context: RouteContext) {
        const scope = WebServer.scope(context.query.get("scope"));
        const target = scope === "guild" ? (await this.guild(context.query.get("guild"))).id : scope === "all" ? ALL_GUILDS : undefined;
        const addable = context.query.get("listing") === "addable";
        if (addable && scope !== "guild") throw new HttpError(400, "Only guild files can be added to a guild");
        return WebServer.withDetails(await this.manager(context).listFromFile(addable ? Listing.ADDABLE : Listing.ALL, target, false));
    }

    private async listRemote(context: RouteContext) {
        const manager = this.manager(context);
        const scope = WebServer.scope(context.query.get("scope"));
        if (scope === "global") return WebServer.withDetails(await manager.list(false));
        if (scope === "guild") {
            const guild = await this.guild(context.query.get("guild"));
            // Global interactions are also available in the guild: the page tells them apart with their scope
            const available = context.query.get("available") === "true";
            return WebServer.withDetails([...available ? await manager.list(false) : [], ...await manager.listGuild(guild.id, false)]);
        }
        return WebServer.withDetails(await manager.listPerGuild(await this.loadGuilds()));
    }

    private async count(context: RouteContext) {
        const counts = await this.manager(context).countEachGuild(await this.loadGuilds());
        return counts.map(({guild, global, specific}) => ({id: guild.id, name: guild.name, global, specific}));
    }

    /**
     * Deploys local files to Discord: global files, guild files to one guild, or to every guild still pending in them.
     * With add, deploys guild files that do not target the guild yet, and adds the guild to them.
     */
    private async deploy(context: RouteContext) {
        const manager = this.manager(context);
        const body = WebServer.body(context);
        const filenames = WebServer.stringList(body.filenames, "filenames");
        const scope = WebServer.scope(body.scope);
        const add = body.add === true;
        if (add && scope !== "guild") throw new HttpError(400, "Choose a guild to add guild interactions to");

        const guild = scope === "guild" ? await this.guild(body.guild) : null;
        const target = guild ? guild.id : scope === "all" ? ALL_GUILDS : undefined;
        const selected = WebServer.pick(await manager.listFromFile(add ? Listing.ADDABLE : Listing.LOCAL, target, false), filenames, cmd => cmd.filename!, "nothing to deploy");
        if (selected.length > 0) await manager.deploy(selected);
    }

    private async update(context: RouteContext) {
        const manager = this.manager(context);
        const body = WebServer.body(context);
        const filenames = WebServer.stringList(body.filenames, "filenames");
        const scope = WebServer.scope(body.scope);

        const guild = scope === "guild" ? await this.guild(body.guild) : null;
        const target = guild ? guild.id : scope === "all" ? ALL_GUILDS : undefined;
        const selected = WebServer.pick(await manager.listFromFile(Listing.DEPLOYED, target, false), filenames, cmd => cmd.filename!, "not deployed in this scope");
        if (selected.length > 0) await manager.update(selected, guild);
    }

    /**
     * Deletes interactions listed from Discord, so the ones without local file can be deleted too.
     * The keys are "type:name", unique in a scope.
     */
    private async delete(context: RouteContext) {
        const manager = this.manager(context);
        const body = WebServer.body(context);
        const keys = WebServer.stringList(body.keys, "keys");
        const scope = WebServer.scope(body.scope);

        const guild = scope === "guild" ? await this.guild(body.guild) : null;
        const remote = scope === "global" ? await manager.list(false)
            : guild ? await manager.listGuild(guild.id, false)
            : await manager.listPerGuild(await this.loadGuilds());
        const selected = WebServer.pick(remote, keys, cmd => `${cmd.type}:${cmd.name}`, "not found on Discord");
        if (selected.length > 0) await manager.delete(selected, guild);
    }

    private async saveRemote(context: RouteContext) {
        const manager = this.manager(context);
        const body = WebServer.body(context);
        const scope = WebServer.scope(body.scope);
        if (scope === "all") throw new HttpError(400, "Save the interactions of one guild at a time");

        if (scope === "global") {
            await manager.saveToGeneratedFiles(await manager.list(false));
        } else {
            const guild = await this.guild(body.guild);
            await manager.saveToGeneratedFiles(await manager.listGuild(guild.id, false), guild.id);
        }
        return {folder: PathUtils.createPathFolder("generated_" + manager.folderPath)};
    }

    // Keeps the order of the list, and reports the identifiers that are not in it
    private static pick(commands: Interaction[], wanted: string[], identify: (cmd: Interaction) => string, missing: string): Interaction[] {
        const found = commands.filter(cmd => wanted.includes(identify(cmd)));
        for (const id of wanted) {
            if (!found.some(cmd => identify(cmd) === id)) Log.error(`${id}: ${missing}`);
        }
        return found;
    }

    // ---- Files of the builder ----

    private filePath(context: RouteContext): string {
        const filename = context.params.filename!;
        const error = InteractionRules.filenameError(filename);
        if (error) throw new HttpError(400, error);
        return PathUtils.createPathFile(this.manager(context).folderPath, `${filename.trim().replace(/\.json$/i, "")}.json`);
    }

    private async readFile(context: RouteContext) {
        const filePath = this.filePath(context);
        if (!await FileManager.fileExists(filePath)) throw new HttpError(404, `${context.params.filename} does not exist`);
        const data = await FileManager.readJsonFile(filePath);
        if (data === false) throw new HttpError(400, `${context.params.filename} is not valid JSON`);
        return data;
    }

    /**
     * Saves an interaction built in the page. The IDs of an existing file are kept:
     * the page cannot change where an interaction is deployed, only which guilds are still pending.
     */
    private writeFile(context: RouteContext) {
        return BaseInteractionManager.fileChanges.run(() => this.writeFileNow(context));
    }

    private async writeFileNow(context: RouteContext) {
        const manager = this.manager(context);
        const filePath = this.filePath(context);
        const body = WebServer.body(context);
        const cmd = body.interaction as Record<string, unknown> | undefined;

        const errors = InteractionRules.validateForSave(cmd);
        if (errors.length > 0) throw new HttpError(400, "The interaction is invalid", {errors});
        if (!manager.commandType.includes(cmd!.type as number)) {
            throw new HttpError(400, `A ${InteractionDetails.typeLabel(cmd!.type as CommandType)} does not belong in the ${manager.folderPath} folder`);
        }

        const exists = await FileManager.fileExists(filePath);
        if (exists && body.overwrite !== true) throw new HttpError(409, `${context.params.filename} already exists`, {exists: true});

        const saved: Record<string, unknown> = {...cmd};
        delete saved.filename;
        WebServer.syncPermissions(saved);
        if (exists) WebServer.keepIds(saved, await this.readFile(context));
        else WebServer.dropIds(saved);

        if (!await FileManager.writeJsonFile(path.dirname(filePath), path.basename(filePath), saved)) {
            throw new HttpError(500, `${path.basename(filePath)} could not be saved`);
        }
        return {filename: path.basename(filePath), interaction: saved};
    }

    private deleteFile(context: RouteContext) {
        return BaseInteractionManager.fileChanges.run(() => this.deleteFileNow(context));
    }

    private async deleteFileNow(context: RouteContext) {
        const filePath = this.filePath(context);
        if (!await FileManager.fileExists(filePath)) throw new HttpError(404, `${context.params.filename} does not exist`);
        let cmd: Interaction | null = null;
        try {
            cmd = InteractionValidator.validate(JSON.parse(await fs.readFile(filePath, "utf8")));
        } catch {
            // An invalid file cannot be deployed: it can be deleted
        }
        if (cmd && WebServer.deployedIds(cmd).length > 0) {
            throw new HttpError(409, `${context.params.filename} is deployed: delete the interaction from Discord first, or its IDs would be lost`);
        }
        await fs.rm(filePath);
    }

    // As the generators: the bitfield follows the names, and no names means everyone
    private static syncPermissions(cmd: Record<string, unknown>): void {
        const names = cmd.default_member_permissions_string;
        if (Array.isArray(names) && names.length > 0) {
            cmd.default_member_permissions = Utils.permissionsToBitfield(names);
        }
    }

    private static dropIds(cmd: Record<string, unknown>): void {
        if (cmd.command_scope === "global") {
            delete cmd.id;
        } else {
            cmd.id = Object.fromEntries(Object.keys(cmd.id as object).map(guildId => [guildId, null]));
        }
    }

    private static keepIds(cmd: Record<string, unknown>, existingData: unknown): void {
        let existing: Interaction;
        try {
            existing = InteractionValidator.validate(existingData);
        } catch {
            this.dropIds(cmd);
            return;
        }
        const deployed = this.deployedIds(existing);

        if (existing.command_scope !== cmd.command_scope) {
            if (deployed.length > 0) {
                throw new HttpError(409, "The scope of a deployed interaction cannot change: delete it from Discord first, then deploy it again");
            }
            this.dropIds(cmd);
            return;
        }
        if (existing.type !== cmd.type && deployed.length > 0) {
            throw new HttpError(409, "The type of a deployed interaction cannot change: delete it from Discord first");
        }

        if (existing.command_scope === "global") {
            if (existing.id) cmd.id = existing.id; else delete cmd.id;
            return;
        }
        const wanted = cmd.id as Record<string, unknown>;
        const removed = deployed.filter(guildId => !(guildId in wanted));
        if (removed.length > 0) {
            throw new HttpError(409, `Deployed in guild ${removed.join(", ")}: delete it from ${removed.length > 1 ? "these guilds" : "this guild"} first`);
        }
        cmd.id = Object.fromEntries(Object.keys(wanted).map(guildId => [guildId, existing.id[guildId] ?? null]));
    }

    // The guilds it is deployed in, or ["global"]
    private static deployedIds(cmd: Interaction): string[] {
        if (cmd.command_scope === "global") return cmd.id ? ["global"] : [];
        return Object.entries(cmd.id).filter(([, id]) => id).map(([guildId]) => guildId);
    }
}
