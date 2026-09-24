import {beforeEach, describe, it, mock} from "node:test";
import assert from "node:assert/strict";
import {SlashCommandGeneratorCLI} from "./SlashCommandsGeneratorCLI";
import {CommandOption, DiscordOptionType} from "../type/InteractionType";

function scripted(answers: string[]): any {
    const generator = new SlashCommandGeneratorCLI();
    (generator as any).prompt = async () => {
        const answer = answers.shift();
        if (answer === undefined) throw new Error("No more scripted answers");
        return answer;
    };
    return generator;
}

beforeEach(() => {
    mock.method(console, "log", () => {});
    mock.method(console, "clear", () => {});
});

describe("SlashCommandGeneratorCLI choices", () => {
    it("validates choice values against the option type", () => {
        assert.equal(SlashCommandGeneratorCLI.isValidChoiceValue(DiscordOptionType.STRING, "abc"), true);
        assert.equal(SlashCommandGeneratorCLI.isValidChoiceValue(DiscordOptionType.INTEGER, "42"), true);
        assert.equal(SlashCommandGeneratorCLI.isValidChoiceValue(DiscordOptionType.INTEGER, "4.2"), false);
        assert.equal(SlashCommandGeneratorCLI.isValidChoiceValue(DiscordOptionType.INTEGER, "abc"), false);
        assert.equal(SlashCommandGeneratorCLI.isValidChoiceValue(DiscordOptionType.NUMBER, "4.2"), true);
        assert.equal(SlashCommandGeneratorCLI.isValidChoiceValue(DiscordOptionType.NUMBER, " "), false);
    });

    it("stores integer choices as numbers", async () => {
        const generator = scripted(["y", "One", "abc", "1", "y", "Two", "2", "n"]);
        assert.deepEqual(await generator.addChoices(DiscordOptionType.INTEGER), [
            {name: "One", value: 1},
            {name: "Two", value: 2},
        ]);
    });

    it("stores string choices as strings", async () => {
        const generator = scripted(["y", "One", "1", "n"]);
        assert.deepEqual(await generator.addChoices(DiscordOptionType.STRING), [{name: "One", value: "1"}]);
    });
});

describe("SlashCommandGeneratorCLI.optionalNumber", () => {
    it("asks again until the value is a valid number", async () => {
        const generator = scripted(["abc", "1.5", "-1", "7000", "12"]);
        assert.equal(await generator.optionalNumber("Min length: ", {integer: true, min: 0, max: 6000}), 12);
    });

    it("returns undefined when left empty", async () => {
        assert.equal(await scripted([""]).optionalNumber("Min value: "), undefined);
    });
});

describe("SlashCommandGeneratorCLI options rules", () => {
    const {SUB_COMMAND, SUB_COMMAND_GROUP, STRING, USER} = DiscordOptionType;
    const option = (type: DiscordOptionType, required?: boolean): CommandOption => ({type, name: `o${type}`, description: "d", required});

    it("only allows subcommands inside a group", () => {
        assert.deepEqual(SlashCommandGeneratorCLI.allowedOptionTypes(SUB_COMMAND_GROUP, []), [SUB_COMMAND]);
    });

    it("never allows subcommands inside a subcommand", () => {
        const allowed = SlashCommandGeneratorCLI.allowedOptionTypes(SUB_COMMAND, []);
        assert.equal(allowed.includes(SUB_COMMAND) || allowed.includes(SUB_COMMAND_GROUP), false);
        assert.equal(allowed.includes(STRING), true);
    });

    it("does not mix subcommands and regular options at the same level", () => {
        assert.deepEqual(SlashCommandGeneratorCLI.allowedOptionTypes(undefined, [option(SUB_COMMAND)]), [SUB_COMMAND, SUB_COMMAND_GROUP]);
        assert.equal(SlashCommandGeneratorCLI.allowedOptionTypes(undefined, [option(STRING)]).includes(SUB_COMMAND), false);
    });

    it("puts required options first", () => {
        const sorted = SlashCommandGeneratorCLI.sortRequiredFirst([option(STRING, false), option(USER, true)]);
        assert.deepEqual(sorted.map(o => o.required), [true, false]);
    });

    it("builds a valid subcommand tree", async () => {
        const generator = scripted([
            "y", "1", "sub", "Sub",
            "y", "1", "3", "a", "A", "n", "n", "", "", "n",
            "y", "6", "a", "b", "B", "y",
            "n",
            "n",
        ]);

        const options = JSON.parse(JSON.stringify(await generator.addOptions()));
        assert.deepEqual(options, [{
            type: 1, name: "sub", description: "Sub", options: [
                {type: 6, name: "b", description: "B", required: true},
                {type: 3, name: "a", description: "A", required: false},
            ],
        }]);
    });
});

describe("BaseCLI.yesNoInput", () => {
    it("ignores case and surrounding spaces", async () => {
        assert.equal(await scripted(["Y"]).yesNoInput("?"), true);
        assert.equal(await scripted([" YES "]).yesNoInput("?"), true);
        assert.equal(await scripted(["No"]).yesNoInput("?"), false);
    });
});
