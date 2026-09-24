import {afterEach, beforeEach, describe, it, mock} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {GlobalInteractionCLI} from "./GlobalInteractionCLI";
import {GuildInteractionCLI} from "./GuildInteractionCLI";
import {AllGuildsInteractionCLI} from "./AllGuildsInteractionCLI";
import {ALL_GUILDS, Listing} from "../enum/Listing";
import {InteractionManagerCLI} from "./InteractionManagerCLI";
import {GuildSelector} from "../GuildSelector";
import {InteractionPayload} from "../interactions/InteractionPayload";
import {NO_PAUSE} from "../BaseCLI";

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

describe("ScopeInteractionCLI.offerDetails", () => {
    it("shows the chosen details until Enter is pressed", async () => {
        const answers = ["5", "1", ""];
        const cli = new GlobalInteractionCLI(undefined as any, manager, "CommandManager") as any;
        cli.input.ask = async () => answers.shift();
        const log = mock.method(console, "log", () => {});

        const result = await cli.offerDetails([
            {name: "ping", type: 1, description: "Ping", command_scope: "global"},
            {name: "Report", type: 3, command_scope: "global"},
        ]);

        assert.equal(result, NO_PAUSE);
        assert.deepEqual(answers, []);
        const output = log.mock.calls.map(call => String(call.arguments[0])).join("\n");
        assert.match(output, /Invalid number/);
        assert.match(output, /Report {3}\(Message Context Menu/);
        assert.doesNotMatch(output, /\/ping/);
    });

    it("does not ask anything when nothing was listed", async () => {
        const cli = new GlobalInteractionCLI(undefined as any, manager, "CommandManager") as any;
        cli.input.ask = async () => { throw new Error("should not ask"); };

        assert.equal(await cli.offerDetails([]), undefined);
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

describe("AllGuildsInteractionCLI", () => {
    const ping = {name: "ping", type: 1, description: "Ping", command_scope: "guild", id: {"111": "c1", "222": "c2"}};

    function allGuilds(calls: unknown[][]) {
        const fakeManager = {
            folderPath: "commands",
            listFromFile: async (...args: unknown[]) => { calls.push(["listFromFile", ...args]); return [ping]; },
            listPerGuild: async (...args: unknown[]) => { calls.push(["listPerGuild", ...args]); return [ping]; },
            update: async (...args: unknown[]) => { calls.push(["update", ...args]); },
            delete: async (...args: unknown[]) => { calls.push(["delete", ...args]); },
        };
        const cli = new AllGuildsInteractionCLI(undefined as any, fakeManager as any, "CommandManager") as any;
        cli.input.ask = async () => "0";
        return cli;
    }

    beforeEach(() => {
        process.env.DISCORD_BOT_TOKEN ||= "token";
        mock.method(console, "table", () => {});
        mock.method(GuildSelector.prototype, "list", async () => [guild]);
    });

    it("updates the deployed guild commands in all their guilds", async () => {
        const calls: unknown[][] = [];
        await allGuilds(calls).handleUpdateAll();
        assert.deepEqual(calls, [["listFromFile", Listing.DEPLOYED, ALL_GUILDS], ["update", [ping], null]]);
    });

    it("deletes the commands listed from Discord from all their guilds", async () => {
        const calls: unknown[][] = [];
        await allGuilds(calls).handleDeleteAll();
        assert.deepEqual(calls, [["listPerGuild", [guild]], ["delete", [ping], null]]);
    });
});
