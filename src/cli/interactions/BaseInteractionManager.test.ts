import {RESTAPIPartialCurrentUserGuild} from "discord-api-types/v10";
import {afterEach, beforeEach, describe, it, mock} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {CommandManager} from "./InteractionManager";
import {ALL_GUILDS, Listing} from "../enum/Listing";

// Guild and command IDs in the Discord format, since local files are validated
const [G1, G2, G3] = ["111111111111111111", "222222222222222222", "333333333333333333"];
const [C1, C2, C3, C4] = ["100000000000000001", "100000000000000002", "100000000000000003", "100000000000000004"];

type RestCall = { method: string; route: string; body?: unknown };
type RestHandler = (call: RestCall) => unknown;

function createManager(handler: RestHandler = () => ({})) {
    const manager = new CommandManager("123456789012345678", "token");
    const calls: RestCall[] = [];
    const call = (method: string) => async (route: string, options?: { body?: unknown }) => {
        const entry = {method, route, body: options?.body};
        calls.push(entry);
        return handler(entry);
    };
    (manager as any).rest = {get: call("get"), post: call("post"), patch: call("patch"), delete: call("delete")};
    return {manager, calls};
}

const guild = (id: string) => ({id, name: `Guild ${id}`}) as RESTAPIPartialCurrentUserGuild;

let folder: string;

async function writeCommand(filename: string, data: unknown) {
    await fs.writeFile(path.join(folder, "commands", filename), JSON.stringify(data));
}

async function readCommand(filename: string) {
    return JSON.parse(await fs.readFile(path.join(folder, "commands", filename), "utf8"));
}

beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "dim-test-"));
    await fs.mkdir(path.join(folder, "commands"));
    process.env.DISCORD_INTERACTION_FOLDER = folder;
    delete process.env.DISCORD_BOT_DEV;
});

afterEach(async () => {
    await fs.rm(folder, {recursive: true, force: true});
});

describe("BaseInteractionManager.delete", () => {
    const local = {name: "ping", type: 1, description: "Ping", command_scope: "guild", id: {[G1]: C1, [G2]: C2}};
    const remote = {name: "ping", type: 1, description: "Ping", command_scope: "guild", id: {[G1]: C1}} as any;

    it("keeps the local ID when Discord refuses the deletion", async () => {
        await writeCommand("ping.json", local);
        const {manager} = createManager(() => { throw new Error("Missing Access"); });

        await manager.delete([remote], guild(G1));

        assert.deepEqual((await readCommand("ping.json")).id, local.id);
    });

    it("does not read the example files when cleaning the IDs", async () => {
        await writeCommand("ping.json", local);
        await fs.writeFile(path.join(folder, "commands", "example.json"), "{ template, not JSON");
        const {manager} = createManager();
        mock.method(console, "log", () => {});
        const error = mock.method(console, "error", () => {});

        await manager.delete([remote], guild(G1));

        assert.equal(error.mock.callCount(), 0);
        assert.deepEqual((await readCommand("ping.json")).id, {[G1]: null, [G2]: C2});
    });

    it("only clears the ID of the guild it was deleted from", async () => {
        await writeCommand("ping.json", local);
        const {manager, calls} = createManager();

        await manager.delete([remote], guild(G1));

        assert.equal(calls.length, 1);
        assert.deepEqual((await readCommand("ping.json")).id, {[G1]: null, [G2]: C2});
    });
});

describe("BaseInteractionManager.deploy", () => {
    beforeEach(() => {
        mock.method(console, "log", () => {});
        mock.method(console, "table", () => {});
        mock.method(console, "error", () => {});
    });

    it("saves the ID of a global command", async () => {
        await writeCommand("ping.json", {name: "ping", type: 1, description: "Ping", command_scope: "global"});
        const {manager, calls} = createManager(() => ({id: C1}));

        await manager.deploy(await manager.listFromFile(Listing.LOCAL));

        assert.deepEqual(calls.map(c => `${c.method} ${c.route}`), ["post /applications/123456789012345678/commands"]);
        const saved = await readCommand("ping.json");
        assert.equal(saved.id, C1);
        assert.equal("filename" in saved, false);
    });

    it("only deploys to the requested guild and keeps the other ones", async () => {
        await writeCommand("ping.json", {name: "ping", type: 1, description: "Ping", command_scope: "guild", id: {[G1]: C1, [G2]: null, [G3]: null}});
        const {manager, calls} = createManager(() => ({id: C2}));

        await manager.deploy(await manager.listFromFile(Listing.LOCAL, G2));

        assert.deepEqual(calls.map(c => c.route), [`/applications/123456789012345678/guilds/${G2}/commands`]);
        assert.deepEqual((await readCommand("ping.json")).id, {[G1]: C1, [G2]: C2, [G3]: null});
    });

    it("adds a guild to a guild command", async () => {
        await writeCommand("ping.json", {name: "ping", type: 1, description: "Ping", command_scope: "guild", id: {[G1]: C1}});
        await writeCommand("here.json", {name: "here", type: 1, description: "Here", command_scope: "guild", id: {[G2]: C3}});
        await writeCommand("global.json", {name: "global", type: 1, description: "Global", command_scope: "global"});
        const {manager, calls} = createManager(() => ({id: C2}));

        const addable = await manager.listFromFile(Listing.ADDABLE, G2);
        await manager.deploy(addable);

        assert.deepEqual(addable.map(c => c.name), ["ping"]);
        assert.deepEqual(calls.map(c => `${c.method} ${c.route}`), [`post /applications/123456789012345678/guilds/${G2}/commands`]);
        assert.deepEqual((await readCommand("ping.json")).id, {[G1]: C1, [G2]: C2});
    });

    it("adds a guild to a command generated without guild", async () => {
        await writeCommand("ping.json", {name: "ping", type: 1, description: "Ping", command_scope: "guild", id: {}});
        const {manager} = createManager(() => ({id: C2}));

        await manager.deploy(await manager.listFromFile(Listing.ADDABLE, G2));

        assert.deepEqual((await readCommand("ping.json")).id, {[G2]: C2});
    });

    it("does not add the guild when Discord refuses the deployment", async () => {
        await writeCommand("ping.json", {name: "ping", type: 1, description: "Ping", command_scope: "guild", id: {[G1]: C1}});
        const {manager} = createManager(() => { throw new Error("Missing Access"); });

        await manager.deploy(await manager.listFromFile(Listing.ADDABLE, G2));

        assert.deepEqual((await readCommand("ping.json")).id, {[G1]: C1});
    });

    it("keeps the guild pending when Discord refuses the deployment", async () => {
        await writeCommand("ping.json", {name: "ping", type: 1, description: "Ping", command_scope: "guild", id: {[G3]: null}});
        const {manager} = createManager(() => { throw new Error("Missing Access"); });

        await manager.deploy(await manager.listFromFile(Listing.LOCAL, G3));

        assert.deepEqual((await readCommand("ping.json")).id, {[G3]: null});
    });

    it("saves the bitfield matching the permission names", async () => {
        await writeCommand("ban.json", {name: "ban", type: 1, description: "Ban", command_scope: "global", default_member_permissions: "8", default_member_permissions_string: ["BanMembers"]});
        const {manager, calls} = createManager(() => ({id: C1}));

        await manager.deploy(await manager.listFromFile(Listing.LOCAL));

        assert.equal((calls[0]!.body as any).default_member_permissions, "4");
        assert.equal((await readCommand("ban.json")).default_member_permissions, "4");
    });
});

describe("BaseInteractionManager.delete in every guild", () => {
    it("deletes a guild command from every guild it is deployed in", async () => {
        const local = {name: "ping", type: 1, description: "Ping", command_scope: "guild", id: {[G1]: C1, [G2]: C2, [G3]: null}};
        await writeCommand("ping.json", local);
        const {manager, calls} = createManager(({route}) => {
            if (route.includes(`/guilds/${G2}/`)) throw new Error("Missing Access");
            return {};
        });
        mock.method(console, "log", () => {});
        mock.method(console, "error", () => {});

        await manager.delete([local as any], null);

        assert.deepEqual(calls.map(c => `${c.method} ${c.route}`), [
            `delete /applications/123456789012345678/guilds/${G1}/commands/${C1}`,
            `delete /applications/123456789012345678/guilds/${G2}/commands/${C2}`,
        ]);
        assert.deepEqual((await readCommand("ping.json")).id, {[G1]: null, [G2]: C2, [G3]: null});
    });
});

describe("BaseInteractionManager.listPerGuild", () => {
    it("merges the guild commands of every guild and finds their local file", async () => {
        await writeCommand("ping_file.json", {name: "ping", type: 1, description: "Ping", command_scope: "guild", id: {[G1]: C1}});
        await writeCommand("global.json", {name: "other", type: 1, description: "d", command_scope: "global"});
        const remote: Record<string, unknown[]> = {
            [G1]: [{id: C1, type: 1, name: "ping", description: "Ping", guild_id: G1}],
            [G2]: [
                {id: C2, type: 1, name: "ping", description: "Ping", guild_id: G2},
                {id: C3, type: 1, name: "other", description: "d", guild_id: G2},
            ],
        };
        const {manager} = createManager(({route}) => remote[route.split("/")[4]!]);

        const commands = await manager.listPerGuild([guild(G1), guild(G2)]);

        assert.deepEqual(commands.map(c => [c.name, c.id, c.filename]), [
            ["ping", {[G1]: C1, [G2]: C2}, "ping_file.json"],
            ["other", {[G2]: C3}, undefined],
        ]);
    });
});

describe("BaseInteractionManager.countPerGuild", () => {
    it("counts the global and guild commands available in each guild", async () => {
        const remote: Record<string, unknown[]> = {
            commands: [{id: C1, type: 1, name: "ping", description: "d"}, {id: C4, type: 3, name: "Report"}],
            [G1]: [{id: C2, type: 1, name: "here", description: "d", guild_id: G1}],
            [G2]: [],
        };
        const {manager} = createManager(({route}) => remote[route.split("/")[4] ?? "commands"]);
        mock.method(console, "log", () => {});
        const table = mock.method(console, "table", () => {});

        await manager.countPerGuild([guild(G1), guild(G2)]);

        assert.deepEqual(table.mock.calls[0]!.arguments[0], [
            {"Guild": `Guild ${G1} (${G1})`, "Global Commands": 1, "Specific Commands": 1, "Total": 2},
            {"Guild": `Guild ${G2} (${G2})`, "Global Commands": 1, "Specific Commands": 0, "Total": 1},
        ]);
    });
});

describe("BaseInteractionManager.update", () => {
    it("keeps updating the next commands when one has no local file", async () => {
        const pong = {name: "pong", type: 1, description: "Pong", command_scope: "global", id: C2};
        await writeCommand("pong.json", pong);
        const {manager, calls} = createManager();

        await manager.update([
            {name: "ping", type: 1, description: "Ping", command_scope: "global", id: C1} as any,
            {...pong, description: "New pong", filename: "pong.json"} as any,
        ], null);

        assert.deepEqual(calls.map(c => c.method), ["patch", "patch"]);
        assert.equal((await readCommand("pong.json")).description, "New pong");
    });

    it("removes on Discord the options removed from the local file", async () => {
        const ping = {name: "ping", type: 1, description: "Ping", command_scope: "global", id: C1};
        await writeCommand("ping.json", ping);
        const {manager, calls} = createManager();

        await manager.update([{...ping, filename: "ping.json"} as any], null);

        assert.deepEqual((calls[0]!.body as any).options, []);
        assert.equal((calls[0]!.body as any).default_member_permissions, null);
    });

    it("updates every guild even when one of them fails", async () => {
        const local = {name: "ping", type: 1, description: "Ping", command_scope: "guild", id: {[G1]: C1, [G2]: C2, [G3]: null}};
        await writeCommand("ping.json", local);
        const {manager, calls} = createManager(({route}) => {
            if (route.includes(`/guilds/${G1}/`)) throw new Error("Missing Access");
            return {};
        });

        await manager.update([{...local, filename: "ping.json"} as any], null);

        assert.deepEqual(calls.map(c => `${c.method} ${c.route}`), [
            `patch /applications/123456789012345678/guilds/${G1}/commands/${C1}`,
            `patch /applications/123456789012345678/guilds/${G2}/commands/${C2}`,
        ]);
    });
});

describe("BaseInteractionManager.listFromFile", () => {
    it("only lists the commands deployed in the requested guild", async () => {
        await writeCommand("global.json", {name: "global", type: 1, description: "d", command_scope: "global", id: C1});
        await writeCommand("here.json", {name: "here", type: 1, description: "d", command_scope: "guild", id: {[G1]: C2, [G2]: C3}});
        await writeCommand("elsewhere.json", {name: "elsewhere", type: 1, description: "d", command_scope: "guild", id: {[G2]: C4}});
        const {manager} = createManager();
        mock.method(console, "log", () => {});
        mock.method(console, "table", () => {});

        const commands = await manager.listFromFile(Listing.DEPLOYED, G1);

        assert.deepEqual(commands.map(c => [c.name, c.id]), [["here", {[G1]: C2}]]);
    });

    it("does not list guild commands pending in the guild as deployed", async () => {
        await writeCommand("pending.json", {name: "pending", type: 1, description: "d", command_scope: "guild", id: {[G1]: null, [G2]: C1}});
        await writeCommand("here.json", {name: "here", type: 1, description: "d", command_scope: "guild", id: {[G1]: C2, [G2]: null}});
        const {manager} = createManager();
        mock.method(console, "log", () => {});
        mock.method(console, "table", () => {});

        const commands = await manager.listFromFile(Listing.DEPLOYED, G1);

        assert.deepEqual(commands.map(c => [c.name, c.id]), [["here", {[G1]: C2}]]);
    });

    it("only lists global commands when no guild is given", async () => {
        await writeCommand("pending.json", {name: "pending", type: 1, description: "d", command_scope: "global"});
        await writeCommand("deployed.json", {name: "deployed", type: 1, description: "d", command_scope: "global", id: C1});
        await writeCommand("guild.json", {name: "guild", type: 1, description: "d", command_scope: "guild", id: {[G1]: null, [G2]: C2}});
        const {manager} = createManager();
        mock.method(console, "log", () => {});
        mock.method(console, "table", () => {});

        assert.deepEqual((await manager.listFromFile(Listing.LOCAL)).map(c => c.name), ["pending"]);
        assert.deepEqual((await manager.listFromFile(Listing.DEPLOYED)).map(c => c.name), ["deployed"]);
        assert.deepEqual((await manager.listFromFile(Listing.ALL)).map(c => c.name).sort(), ["deployed", "pending"]);
    });

    it("lists the guild commands deployed in any guild", async () => {
        await writeCommand("global.json", {name: "global", type: 1, description: "d", command_scope: "global", id: C1});
        await writeCommand("here.json", {name: "here", type: 1, description: "d", command_scope: "guild", id: {[G1]: C2, [G2]: null}});
        await writeCommand("pending.json", {name: "pending", type: 1, description: "d", command_scope: "guild", id: {[G1]: null}});
        const {manager} = createManager();
        mock.method(console, "log", () => {});
        mock.method(console, "table", () => {});

        const commands = await manager.listFromFile(Listing.DEPLOYED, ALL_GUILDS);

        assert.deepEqual(commands.map(c => [c.name, c.id]), [["here", {[G1]: C2}]]);
    });

    it("lists the local files of a guild", async () => {
        await writeCommand("global.json", {name: "global", type: 1, description: "d", command_scope: "global"});
        await writeCommand("here.json", {name: "here", type: 1, description: "d", command_scope: "guild", id: {[G1]: null}});
        await writeCommand("elsewhere.json", {name: "elsewhere", type: 1, description: "d", command_scope: "guild", id: {[G2]: null}});
        const {manager} = createManager();
        mock.method(console, "log", () => {});
        mock.method(console, "table", () => {});

        assert.deepEqual((await manager.listFromFile(Listing.ALL, G1)).map(c => c.name), ["here"]);
    });

    it("reports an unreadable file once and skips it", async () => {
        await fs.writeFile(path.join(folder, "commands", "broken.json"), "{");
        await writeCommand("invalid.json", {name: "invalid", type: 9, command_scope: "global"});
        const {manager} = createManager();
        mock.method(console, "log", () => {});
        mock.method(console, "table", () => {});
        const error = mock.method(console, "error", () => {});

        const commands = await manager.listFromFile(Listing.LOCAL);

        assert.deepEqual(commands, []);
        assert.equal(error.mock.callCount(), 2);
    });

    it("keeps listing the other files when a permission bitfield is invalid", async () => {
        await writeCommand("broken.json", {name: "broken", type: 1, description: "d", command_scope: "global", default_member_permissions: "abc"});
        await writeCommand("ping.json", {name: "ping", type: 1, description: "d", command_scope: "global", default_member_permissions: "8"});
        const {manager} = createManager();
        mock.method(console, "log", () => {});
        mock.method(console, "table", () => {});
        mock.method(console, "error", () => {});

        assert.deepEqual((await manager.listFromFile(Listing.LOCAL)).map(c => c.name), ["ping"]);
    });

    it("reports a context menu in the commands folder", async () => {
        await writeCommand("report.json", {name: "Report", type: 3, command_scope: "global"});
        await writeCommand("ping.json", {name: "ping", type: 1, description: "d", command_scope: "global"});
        const {manager} = createManager();
        mock.method(console, "log", () => {});
        mock.method(console, "table", () => {});
        const error = mock.method(console, "error", () => {});

        assert.deepEqual((await manager.listFromFile(Listing.LOCAL)).map(c => c.name), ["ping"]);
        assert.match(String(error.mock.calls[0]!.arguments[0]), /report\.json: a Message Context Menu does not belong in the commands folder/);
    });

    it("warns about files defining the same command in the same scope", async () => {
        await writeCommand("ping.json", {name: "ping", type: 1, description: "d", command_scope: "global"});
        await writeCommand("ping_copy.json", {name: "ping", type: 1, description: "d", command_scope: "global"});
        await writeCommand("here.json", {name: "here", type: 1, description: "d", command_scope: "guild", id: {[G1]: null}});
        await writeCommand("here_elsewhere.json", {name: "here", type: 1, description: "d", command_scope: "guild", id: {[G2]: null}});
        const {manager} = createManager();
        mock.method(console, "log", () => {});
        mock.method(console, "table", () => {});
        const warn = mock.method(console, "warn", () => {});

        await manager.listFromFile(Listing.ALL);
        await manager.listFromFile(Listing.ALL, ALL_GUILDS);

        assert.equal(warn.mock.callCount(), 1);
        assert.match(String(warn.mock.calls[0]!.arguments[0]), /ping(_copy)?\.json and ping(_copy)?\.json both define the Slash "ping" globally/);
    });

    it("only skips files whose name starts with example", async () => {
        await writeCommand("example_v2.json", {name: "example", type: 1, description: "d", command_scope: "global"});
        await writeCommand("counterexample.json", {name: "counterexample", type: 1, description: "d", command_scope: "global"});
        const {manager} = createManager();
        mock.method(console, "log", () => {});
        mock.method(console, "table", () => {});

        const commands = await manager.listFromFile(Listing.LOCAL);

        assert.deepEqual(commands.map(c => c.name), ["counterexample"]);
    });
});
