import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {DiscordRegex} from "./DiscordRegex";

describe("DiscordRegex snowflakes", () => {
    it("accepts IDs from 17 to 20 digits", () => {
        for (const id of ["81384788765712384", "123456789012345678", "1214320754578165901", "12345678901234567890"]) {
            assert.equal(DiscordRegex.GUILD_ID.test(id), true, id);
        }
    });

    it("rejects anything else", () => {
        for (const id of ["", "1234567890123456", "123456789012345678901", "12345678901234567a", " 123456789012345678"]) {
            assert.equal(DiscordRegex.GUILD_ID.test(id), false, id);
        }
    });
});
