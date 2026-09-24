import {beforeEach, describe, it, mock} from "node:test";
import assert from "node:assert/strict";
import {Prompt} from "./Prompt";

function scripted(answers: string[]): Prompt {
    const prompt = new Prompt();
    prompt.ask = async () => {
        const answer = answers.shift();
        if (answer === undefined) throw new Error("No more scripted answers");
        return answer;
    };
    return prompt;
}

beforeEach(() => {
    mock.method(console, "log", () => {});
});

describe("Prompt.yesNoInput", () => {
    it("ignores case and surrounding spaces", async () => {
        assert.equal(await scripted(["Y"]).yesNoInput("?"), true);
        assert.equal(await scripted([" YES "]).yesNoInput("?"), true);
        assert.equal(await scripted(["No"]).yesNoInput("?"), false);
    });

    it("adds the answers to the question", async () => {
        const prompt = new Prompt();
        const questions: string[] = [];
        prompt.ask = async (question: string) => { questions.push(question); return "y"; };
        await prompt.yesNoInput("Required?");
        assert.deepEqual(questions, ["Required? (y/n): "]);
    });

    it("asks again on invalid answers", async () => {
        assert.equal(await scripted(["", "maybe", "n"]).yesNoInput("?"), false);
    });
});

describe("Prompt.requireInput", () => {
    it("asks again until the value is valid", async () => {
        assert.equal(await scripted(["", "abc", "42"]).requireInput("?", val => /^\d+$/.test(val)), "42");
    });

    it("accepts an empty value when allowed", async () => {
        assert.equal(await scripted([""]).requireInput("?", undefined, true), "");
    });
});
