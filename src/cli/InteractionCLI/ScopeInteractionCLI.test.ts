import {afterEach, beforeEach, describe, it, mock} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {GlobalInteractionCLI} from "./GlobalInteractionCLI";
import {GuildInteractionCLI} from "./GuildInteractionCLI";
import {InteractionManagerCLI} from "./InteractionManagerCLI";
import {GuildSelector} from "../GuildSelector";
import {InteractionPayload} from "../interactions/InteractionPayload";

const manager = {folderPath: "commands"} as any;
const guild = {id: "111", name: "Guild 111"} as any;

function select(answer: string, commands: unknown[]) {
    const cli = new GlobalInteractionCLI(undefined as any, manager, "CommandManager") as any;
    cli.input.ask = async () => answer;
    return cli.selectCommands(commands);
}

beforeEach(() => {
    mock.method(console, "log", () => {});
});

describe("ScopeInteractionCLI.selectCommands", () => {
    const commands = ["a", "b", "c"];

    it("selects each command once", async () => {
        assert.deepEqual(await select("2, 0,2", commands), ["c", "a"]);
    });

    it("accepts all and exit with spaces and any case", async () => {
        assert.deepEqual(await select(" ALL ", commands), commands);
        assert.deepEqual(await select(" Exit", commands), []);
    });

    it("rejects the whole selection when a number is invalid", async () => {
        for (const answer of ["1,abc", "1,3", "1.5", ""]) {
            assert.deepEqual(await select(answer, commands), [], answer);
        }
    });
});

describe("ScopeInteractionCLI.saveToLocalFiles", () => {
    let folder: string;

    beforeEach(async () => {
        folder = await fs.mkdtemp(path.join(os.tmpdir(), "dim-test-"));
        process.env.DISCORD_INTERACTION_FOLDER = folder;
        delete process.env.DISCORD_BOT_DEV;
        mock.method(console, "info", () => {});
    });

    afterEach(async () => {
        await fs.rm(folder, {recursive: true, force: true});
    });

    it("saves the commands of a guild in their own folder", async () => {
        const raw = {id: "c1", application_id: "app", version: "v1", type: 1, name: "ping", description: "Ping", guild_id: "111"} as any;
        const cli = new GuildInteractionCLI(undefined as any, manager, "CommandManager", guild) as any;

        await cli.saveToLocalFiles([InteractionPayload.fromDiscord(raw)], guild.id);

        const saved = JSON.parse(await fs.readFile(path.join(folder, "generated_commands", "111", "ping.json"), "utf8"));
        assert.equal(saved.command_scope, "guild");
        assert.deepEqual(saved.id, {"111": "c1"});
    });
});

describe("InteractionManagerCLI", () => {
    beforeEach(() => {
        process.env.DISCORD_BOT_TOKEN ||= "token";
    });

    it("stays in the menu when no guild is chosen", async () => {
        mock.method(GuildSelector.prototype, "chooseGuild", async () => null);
        const cli = new InteractionManagerCLI(undefined as any, manager, "CommandManager") as any;

        assert.equal(await cli.openGuild(), null);
    });

    it("opens the guild menu of the chosen guild", async () => {
        mock.method(GuildSelector.prototype, "chooseGuild", async () => guild);
        const cli = new InteractionManagerCLI(undefined as any, manager, "CommandManager") as any;

        const menu = await cli.openGuild();

        assert.ok(menu instanceof GuildInteractionCLI);
        assert.equal((menu as any).guild, guild);
    });
});
