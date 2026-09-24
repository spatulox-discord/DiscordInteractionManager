import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Env} from "./Env";

describe("Env.dev", () => {
    it("is only enabled by an explicit true value", () => {
        const cases: [string | undefined, boolean][] = [
            [undefined, false], ["", false], ["false", false], ["0", false], ["no", false],
            ["true", true], ["TRUE", true], [" true ", true], ["1", true],
        ];
        for (const [value, expected] of cases) {
            if (value === undefined) delete process.env.DISCORD_BOT_DEV;
            else process.env.DISCORD_BOT_DEV = value;
            assert.equal(Env.dev, expected, String(value));
        }
    });
});
