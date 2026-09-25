import {afterEach, beforeEach, describe, it, mock} from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {WebServer} from "./WebServer";
import {CommandManager, ContextMenuManager} from "../cli/interactions/InteractionManager";
import {FolderName} from "../type/FolderName";

const [G1, G2] = ["111111111111111111", "222222222222222222"];
const [C1, C2] = ["100000000000000001", "100000000000000002"];
const guilds = [{id: G1, name: "Guild one"}, {id: G2, name: "Guild two"}] as any[];

type RestCall = { method: string; route: string; body?: unknown };

let folder: string;
let server: WebServer;
let origin: string;
let url: string;
let calls: RestCall[];
let remote: Record<string, unknown[]>;
let guildListings: number;
let postGate: Promise<void> | null; // Holds the POST requests to Discord until it resolves

function mockRest(manager: CommandManager | ContextMenuManager) {
    const call = (method: string) => async (route: string, options?: { body?: unknown }) => {
        calls.push({method, route, body: options?.body});
        if (method === "get") return remote[route] ?? [];
        if (method === "post") {
            await postGate;
            return {id: C2};
        }
        return {};
    };
    (manager as any).rest = {get: call("get"), post: call("post"), patch: call("patch"), delete: call("delete")};
    return manager;
}

function request(method: string, route: string, body?: unknown, headers: Record<string, string> = {}) {
    return fetch(`${origin}${route}`, {
        method,
        headers: {"X-DIM-Token": server.sessionToken, ...body === undefined ? {} : {"Content-Type": "application/json"}, ...headers},
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

async function json(method: string, route: string, body?: unknown) {
    const response = await request(method, route, body);
    return {status: response.status, body: await response.json() as any};
}

async function writeCommand(filename: string, data: unknown) {
    await fs.writeFile(path.join(folder, "commands", filename), JSON.stringify(data));
}

async function readCommand(filename: string) {
    return JSON.parse(await fs.readFile(path.join(folder, "commands", filename), "utf8"));
}

beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "dim-web-"));
    await fs.mkdir(path.join(folder, "commands"));
    process.env.DISCORD_INTERACTION_FOLDER = folder;
    delete process.env.DISCORD_BOT_DEV;
    calls = [];
    remote = {};
    postGate = null;
    guildListings = 0;

    server = new WebServer({
        token: "token",
        application: {id: "123456789012345678", name: "Test bot"} as any,
        port: 0,
        managers: {
            [FolderName.SLASH_COMMANDS]: mockRest(new CommandManager("123456789012345678", "token")),
            [FolderName.CONTEXT_MENU]: mockRest(new ContextMenuManager("123456789012345678", "token")),
        },
        fetchGuilds: async () => {
            guildListings++;
            return guilds;
        },
    });
    url = await server.start();
    origin = server.origin();
});

afterEach(async () => {
    await server.close();
    mock.restoreAll();
    await fs.rm(folder, {recursive: true, force: true});
});

describe("WebServer security", () => {
    it("gives the session token in the URL to open", async () => {
        assert.equal(url, `${origin}/#token=${server.sessionToken}`);
        assert.match(server.sessionToken, /^[\w-]{32}$/);
    });

    it("refuses the API without the session token", async () => {
        const response = await request("GET", "/api/app", undefined, {"X-DIM-Token": "wrong"});
        assert.equal(response.status, 401);
    });

    it("refuses another host name, as sent by a DNS rebinding page", async () => {
        const status = await new Promise<number>((resolve, reject) => {
            const url = new URL(`${origin}/api/app`);
            http.get({host: url.hostname, port: url.port, path: url.pathname, headers: {Host: "evil.example:80", "X-DIM-Token": server.sessionToken}},
                response => resolve(response.statusCode!)).on("error", reject);
        });
        assert.equal(status, 403);
    });

    it("serves the page without token, and nothing outside its folder", async () => {
        const page = await fetch(`${origin}/`);
        assert.equal(page.status, 200);
        assert.match(await page.text(), /Discord Interaction Manager/);
        assert.equal((await fetch(`${origin}/%2e%2e/WebServer.ts`)).status, 404);
    });
});

describe("WebServer API", () => {
    it("describes the application", async () => {
        const {status, body} = await json("GET", "/api/app");
        assert.equal(status, 200);
        assert.equal(body.data.name, "Test bot");
        assert.equal(body.data.folders.commands, `${folder}/commands`);
    });

    it("gives the bit of every permission name to the builder", async () => {
        const {body} = await json("GET", "/api/meta");
        assert.equal(body.data.permissionBits.BanMembers, "4");
        assert.equal(body.data.permissionBits.Administrator, "8");
    });

    it("returns the messages of the request, such as an invalid file", async () => {
        mock.method(console, "error", () => {});
        await writeCommand("broken.json", {name: "broken", type: 1});
        await writeCommand("ping.json", {name: "ping", type: 1, description: "Ping", command_scope: "global"});

        const {body} = await json("GET", "/api/commands/local?scope=global");

        assert.deepEqual(body.data.map((cmd: any) => cmd.filename), ["ping.json"]);
        assert.equal(body.data[0].key, "1:ping");
        assert.equal(body.messages[0].level, "error");
        assert.match(body.messages[0].message, /broken\.json/);
    });

    it("rejects an unknown kind or scope", async () => {
        assert.equal((await json("GET", "/api/modals/local?scope=global")).status, 404);
        assert.equal((await json("GET", "/api/commands/local?scope=everywhere")).status, 400);
    });

    it("deploys a local file and saves its ID", async () => {
        await writeCommand("ping.json", {name: "ping", type: 1, description: "Ping", command_scope: "global"});

        const {status} = await json("POST", "/api/commands/deploy", {scope: "global", filenames: ["ping.json"]});

        assert.equal(status, 200);
        assert.equal(calls.filter(call => call.method === "post").length, 1);
        assert.equal((await readCommand("ping.json")).id, C2);
    });

    it("deploys a guild file only to the chosen guild", async () => {
        await writeCommand("here.json", {name: "here", type: 1, description: "Here", command_scope: "guild", id: {[G1]: null, [G2]: null}});

        await json("POST", "/api/commands/deploy", {scope: "guild", guild: G1, filenames: ["here.json"]});

        assert.deepEqual(calls.map(call => call.route), [`/applications/123456789012345678/guilds/${G1}/commands`]);
        assert.deepEqual((await readCommand("here.json")).id, {[G1]: C2, [G2]: null});
    });

    it("deploys a guild file to every guild still pending in it", async () => {
        await writeCommand("here.json", {name: "here", type: 1, description: "Here", command_scope: "guild", id: {[G1]: C1, [G2]: null}});

        await json("POST", "/api/commands/deploy", {scope: "all", filenames: ["here.json"]});

        assert.deepEqual(calls.map(call => call.route), [`/applications/123456789012345678/guilds/${G2}/commands`]);
        assert.deepEqual((await readCommand("here.json")).id, {[G1]: C1, [G2]: C2});
    });

    it("reports the selected files that cannot be deployed", async () => {
        const {body} = await json("POST", "/api/commands/deploy", {scope: "global", filenames: ["missing.json"]});
        assert.deepEqual(body.messages, [{level: "error", message: "missing.json: nothing to deploy"}]);
        assert.equal(calls.length, 0);
    });

    it("deletes from Discord by type and name, and removes the local ID", async () => {
        await writeCommand("ping.json", {name: "ping", type: 1, description: "Ping", command_scope: "global", id: C1});
        remote["/applications/123456789012345678/commands"] = [{id: C1, type: 1, name: "ping", description: "Ping"}];

        await json("POST", "/api/commands/delete", {scope: "global", keys: ["1:ping"]});

        assert.deepEqual(calls.filter(call => call.method === "delete").map(call => call.route), [`/applications/123456789012345678/commands/${C1}`]);
        assert.equal((await readCommand("ping.json")).id, undefined);
    });

    it("lists the guilds once for the refreshes of All guilds that follow", async () => {
        await json("GET", "/api/commands/remote?scope=all");
        await json("GET", "/api/commands/remote?scope=all");
        await json("GET", "/api/commands/count");
        assert.equal(guildListings, 1);

        await json("GET", "/api/guilds");
        assert.equal(guildListings, 2);
    });

    it("counts the interactions of each guild", async () => {
        remote[`/applications/123456789012345678/guilds/${G1}/commands`] = [{id: C1, type: 1, name: "here", description: "d", guild_id: G1}];
        const {body} = await json("GET", "/api/commands/count");
        assert.deepEqual(body.data, [
            {id: G1, name: "Guild one", global: 0, specific: 1},
            {id: G2, name: "Guild two", global: 0, specific: 0},
        ]);
    });
});

describe("WebServer files", () => {
    const ping = {name: "ping", type: 1, description: "Ping", command_scope: "global"};

    it("saves a new interaction without ID, and its permission bitfield", async () => {
        const {status} = await json("PUT", "/api/commands/files/ping", {interaction: {...ping, id: C1, default_member_permissions_string: ["BanMembers"]}});

        assert.equal(status, 200);
        const saved = await readCommand("ping.json");
        assert.equal(saved.id, undefined);
        assert.equal(saved.default_member_permissions, "4");
    });

    it("returns every error of an invalid interaction", async () => {
        const {status, body} = await json("PUT", "/api/commands/files/ping", {interaction: {...ping, name: "Ping", description: ""}});
        assert.equal(status, 400);
        assert.deepEqual(body.errors, ["name: lowercase letters, digits, - _ ', 1-32 characters", "description: 1-100 characters"]);
    });

    it("refuses a context menu in the commands folder, and unsafe or example names", async () => {
        assert.equal((await json("PUT", "/api/commands/files/report", {interaction: {name: "Report", type: 2, command_scope: "global"}})).status, 400);
        assert.equal((await json("PUT", "/api/commands/files/example_ping", {interaction: ping})).status, 400);
        assert.equal((await json("PUT", "/api/commands/files/..%2Fping", {interaction: ping})).status, 400);
    });

    it("asks before overwriting a file", async () => {
        await writeCommand("ping.json", ping);
        const {status, body} = await json("PUT", "/api/commands/files/ping", {interaction: {...ping, description: "New"}});
        assert.equal(status, 409);
        assert.equal(body.exists, true);
        assert.equal((await readCommand("ping.json")).description, "Ping");
    });

    it("keeps the IDs of an existing file", async () => {
        await writeCommand("here.json", {...ping, command_scope: "guild", id: {[G1]: C1}});

        await json("PUT", "/api/commands/files/here", {overwrite: true, interaction: {...ping, description: "New", command_scope: "guild", id: {[G1]: null, [G2]: C2}}});

        const saved = await readCommand("here.json");
        assert.equal(saved.description, "New");
        assert.deepEqual(saved.id, {[G1]: C1, [G2]: null});
    });

    it("refuses to change the scope of a deployed file, or to drop one of its guilds", async () => {
        await writeCommand("here.json", {...ping, command_scope: "guild", id: {[G1]: C1}});

        const scope = await json("PUT", "/api/commands/files/here", {overwrite: true, interaction: ping});
        const guild = await json("PUT", "/api/commands/files/here", {overwrite: true, interaction: {...ping, command_scope: "guild", id: {[G2]: null}}});

        assert.equal(scope.status, 409);
        assert.equal(guild.status, 409);
        assert.match(guild.body.error, new RegExp(`Deployed in guild ${G1}`));
    });

    it("waits for a running deployment before saving, so its ID is kept", async () => {
        await writeCommand("ping.json", ping);
        let release!: () => void;
        postGate = new Promise(resolve => release = resolve);

        const deploying = json("POST", "/api/commands/deploy", {scope: "global", filenames: ["ping.json"]});
        let saved = false;
        let saving!: Promise<unknown>;
        try {
            while (!calls.some(call => call.method === "post")) await new Promise(resolve => setTimeout(resolve, 1));
            saving = json("PUT", "/api/commands/files/ping", {overwrite: true, interaction: {...ping, description: "New"}}).then(() => saved = true);
            await new Promise(resolve => setTimeout(resolve, 20));
            assert.equal(saved, false);
        } finally {
            release(); // Else the server could not close
        }
        await Promise.all([deploying, saving]);
        const file = await readCommand("ping.json");
        assert.equal(file.id, C2);
        assert.equal(file.description, "New");
    });

    it("deletes a file only when it is not deployed", async () => {
        await writeCommand("ping.json", ping);
        await writeCommand("pong.json", {...ping, name: "pong", id: C1});

        assert.equal((await json("DELETE", "/api/commands/files/ping.json")).status, 200);
        assert.equal((await json("DELETE", "/api/commands/files/pong.json")).status, 409);
        assert.deepEqual((await fs.readdir(path.join(folder, "commands"))).sort(), ["pong.json"]);
    });
});
