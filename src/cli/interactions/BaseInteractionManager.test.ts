import {RESTAPIPartialCurrentUserGuild} from "discord-api-types/v10";
import {afterEach, beforeEach, describe, it, mock} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {CommandManager} from "./InteractionManager";
import {Listing} from "../enum/Listing";

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
    const local = {name: "ping", type: 1, description: "Ping", command_scope: "guild", id: {"111": "c1", "222": "c2"}};
    const remote = {name: "ping", type: 1, description: "Ping", command_scope: "guild", id: {"111": "c1"}} as any;

    it("keeps the local ID when Discord refuses the deletion", async () => {
        await writeCommand("ping.json", local);
        const {manager} = createManager(() => { throw new Error("Missing Access"); });

        await manager.delete([remote], guild("111"));

        assert.deepEqual((await readCommand("ping.json")).id, local.id);
    });

    it("only clears the ID of the guild it was deleted from", async () => {
        await writeCommand("ping.json", local);
        const {manager, calls} = createManager();

        await manager.delete([remote], guild("111"));

        assert.equal(calls.length, 1);
        assert.deepEqual((await readCommand("ping.json")).id, {"111": null, "222": "c2"});
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
        const {manager, calls} = createManager(() => ({id: "c1"}));

        await manager.deploy(await manager.listFromFile(Listing.LOCAL));

        assert.deepEqual(calls.map(c => `${c.method} ${c.route}`), ["post /applications/123456789012345678/commands"]);
        const saved = await readCommand("ping.json");
        assert.equal(saved.id, "c1");
        assert.equal("filename" in saved, false);
    });

    it("only deploys to the pending guilds and keeps the failed ones pending", async () => {
        await writeCommand("ping.json", {name: "ping", type: 1, description: "Ping", command_scope: "guild", id: {"111": "c1", "222": null, "333": null}});
        const {manager, calls} = createManager(({route}) => {
            if (route.includes("/guilds/333/")) throw new Error("Missing Access");
            return {id: "c2"};
        });

        await manager.deploy(await manager.listFromFile(Listing.LOCAL));

        assert.deepEqual(calls.map(c => c.route), [
            "/applications/123456789012345678/guilds/222/commands",
            "/applications/123456789012345678/guilds/333/commands",
        ]);
        assert.deepEqual((await readCommand("ping.json")).id, {"111": "c1", "222": "c2", "333": null});
    });

    it("saves the bitfield matching the permission names", async () => {
        await writeCommand("ban.json", {name: "ban", type: 1, description: "Ban", command_scope: "global", default_member_permissions: "8", default_member_permissions_string: ["BanMembers"]});
        const {manager, calls} = createManager(() => ({id: "c1"}));

        await manager.deploy(await manager.listFromFile(Listing.LOCAL));

        assert.equal((calls[0]!.body as any).default_member_permissions, "4");
        assert.equal((await readCommand("ban.json")).default_member_permissions, "4");
    });
});

describe("BaseInteractionManager.update", () => {
    it("keeps updating the next commands when one has no local file", async () => {
        const pong = {name: "pong", type: 1, description: "Pong", command_scope: "global", id: "c2"};
        await writeCommand("pong.json", pong);
        const {manager, calls} = createManager();

        await manager.update([
            {name: "ping", type: 1, description: "Ping", command_scope: "global", id: "c1"} as any,
            {...pong, description: "New pong", filename: "pong.json"} as any,
        ], null);

        assert.deepEqual(calls.map(c => c.method), ["patch", "patch"]);
        assert.equal((await readCommand("pong.json")).description, "New pong");
    });

    it("removes on Discord the options removed from the local file", async () => {
        const ping = {name: "ping", type: 1, description: "Ping", command_scope: "global", id: "c1"};
        await writeCommand("ping.json", ping);
        const {manager, calls} = createManager();

        await manager.update([{...ping, filename: "ping.json"} as any], null);

        assert.deepEqual((calls[0]!.body as any).options, []);
        assert.equal((calls[0]!.body as any).default_member_permissions, null);
    });

    it("updates every guild even when one of them fails", async () => {
        const local = {name: "ping", type: 1, description: "Ping", command_scope: "guild", id: {"111": "c1", "222": "c2", "333": null}};
        await writeCommand("ping.json", local);
        const {manager, calls} = createManager(({route}) => {
            if (route.includes("/guilds/111/")) throw new Error("Missing Access");
            return {};
        });

        await manager.update([{...local, filename: "ping.json"} as any], null);

        assert.deepEqual(calls.map(c => `${c.method} ${c.route}`), [
            "patch /applications/123456789012345678/guilds/111/commands/c1",
            "patch /applications/123456789012345678/guilds/222/commands/c2",
        ]);
    });
});

describe("BaseInteractionManager.listFromFile", () => {
    it("only lists the commands deployed in the requested guild", async () => {
        await writeCommand("global.json", {name: "global", type: 1, description: "d", command_scope: "global", id: "c1"});
        await writeCommand("here.json", {name: "here", type: 1, description: "d", command_scope: "guild", id: {"111": "c2", "222": "c3"}});
        await writeCommand("elsewhere.json", {name: "elsewhere", type: 1, description: "d", command_scope: "guild", id: {"222": "c4"}});
        const {manager} = createManager();
        mock.method(console, "log", () => {});
        mock.method(console, "table", () => {});

        const commands = await manager.listFromFile(Listing.DEPLOYED, "111");

        assert.deepEqual(commands.map(c => [c.name, c.id]), [["here", {"111": "c2"}]]);
    });

    it("does not list guild commands deployed nowhere as deployed", async () => {
        await writeCommand("pending.json", {name: "pending", type: 1, description: "d", command_scope: "guild", id: {"111": null}});
        await writeCommand("here.json", {name: "here", type: 1, description: "d", command_scope: "guild", id: {"111": "c2", "222": null}});
        const {manager} = createManager();
        mock.method(console, "log", () => {});
        mock.method(console, "table", () => {});

        const commands = await manager.listFromFile(Listing.DEPLOYED);

        assert.deepEqual(commands.map(c => [c.name, c.id]), [["here", {"111": "c2"}]]);
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
