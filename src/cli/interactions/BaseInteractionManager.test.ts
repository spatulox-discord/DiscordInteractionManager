import {afterEach, beforeEach, describe, it} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {Guild} from "discord.js";
import {CommandManager} from "./InteractionManager";

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

const guild = (id: string) => ({id, name: `Guild ${id}`}) as Guild;

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
