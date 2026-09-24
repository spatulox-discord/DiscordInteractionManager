import {beforeEach, describe, it, mock} from "node:test";
import assert from "node:assert/strict";
import {SlashCommandGeneratorCLI} from "./SlashCommandsGeneratorCLI";
import {CommandOption, DiscordOptionType, InteractionContextType} from "../type/InteractionType";

function scripted(answers: string[]): any {
    const generator = new SlashCommandGeneratorCLI();
    (generator as any).input.ask = async () => {
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

describe("SlashCommandGeneratorCLI.isValidName", () => {
    it("accepts lowercase unicode names", () => {
        for (const name of ["ping", "liber-thé", "l'heure", "ping_2", "日本"]) {
            assert.equal(SlashCommandGeneratorCLI.isValidName(name), true, name);
        }
    });

    it("rejects uppercase, spaces and too long names", () => {
        for (const name of ["", "Ping", "LIBER-THÉ", "my command", "a".repeat(33), "ping!"]) {
            assert.equal(SlashCommandGeneratorCLI.isValidName(name), false, name);
        }
    });
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

describe("SlashCommandGeneratorCLI.handleOptionType", () => {
    it("never accepts a maximum below the minimum", async () => {
        const answers = ["n", "10", "5", "10", "n"];
        const option: any = {};
        await scripted(answers).handleOptionType(option, DiscordOptionType.STRING);
        assert.deepEqual(answers, []);
        assert.equal(option.min_length, 10);
        assert.equal(option.max_length, 10);
    });

    it("never accepts a maximum value below the minimum value", async () => {
        const answers = ["n", "-2", "-3", "-2", "n"];
        const option: any = {};
        await scripted(answers).handleOptionType(option, DiscordOptionType.INTEGER);
        assert.deepEqual(answers, []);
        assert.equal(option.max_value, -2);
    });
});

describe("SlashCommandGeneratorCLI numeric autocomplete", () => {
    it("offers autocomplete and then skips choices", async () => {
        const answers = ["y", "", ""];
        const option: any = {};
        await scripted(answers).handleOptionType(option, DiscordOptionType.NUMBER);
        assert.deepEqual(answers, []);
        assert.equal(option.autocomplete, true);
        assert.equal(option.choices, undefined);
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

describe("InteractionGeneratorCLI index lists", () => {
    it("asks again when a permission number is not an integer", async () => {
        const config: any = {};
        const answers = ["1abc", "0, 0"];
        await scripted(answers).addPermissions(config);
        assert.deepEqual(answers, []);
        assert.equal(config.default_member_permissions_string.length, 1);
    });

    it("asks again when a channel type is not an integer", async () => {
        const answers = ["0x", "0,2,0"];
        assert.deepEqual(await scripted(answers).addChannelTypes(), [0, 2]);
        assert.deepEqual(answers, []);
    });

    it("accepts stage channels and rejects DM channel types", async () => {
        const answers = ["1", "3", "13"];
        assert.deepEqual(await scripted(answers).addChannelTypes(), [13]);
        assert.deepEqual(answers, []);
    });
});

describe("InteractionGeneratorCLI.selectEnumValues", () => {
    const select = (answers: string[]) => scripted(answers).selectEnumValues("Contexts", InteractionContextType);

    it("keeps Discord's default when left empty", async () => {
        assert.deepEqual(await select([""]), []);
    });

    it("selects every value with all", async () => {
        assert.deepEqual(await select([" All "]), [0, 1, 2]);
    });

    it("asks again for unknown values", async () => {
        const answers = ["3", "2,0"];
        assert.deepEqual(await select(answers), [2, 0]);
        assert.deepEqual(answers, []);
    });
});
