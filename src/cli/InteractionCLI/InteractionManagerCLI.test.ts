import {beforeEach, describe, it, mock} from "node:test";
import assert from "node:assert/strict";
import {InteractionManagerCLI} from "./InteractionManagerCLI";

function select(answer: string, commands: unknown[]) {
    const cli = new InteractionManagerCLI(undefined as any, {folderPath: "commands"} as any, "CommandManager") as any;
    cli.input.ask = async () => answer;
    return cli.selectCommands(cli.manager, commands);
}

beforeEach(() => {
    mock.method(console, "log", () => {});
});

describe("InteractionManagerCLI.selectCommands", () => {
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
