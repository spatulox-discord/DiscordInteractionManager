import {beforeEach, describe, it, mock} from "node:test";
import assert from "node:assert/strict";
import {SlashCommandGeneratorCLI} from "./SlashCommandsGeneratorCLI";
import {DiscordOptionType} from "../type/InteractionType";

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
