import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {InteractionValidator} from "./InteractionValidator";

describe("InteractionValidator.validate", () => {
    it("keeps fields it does not know about", () => {
        const data = {
            name: "ping",
            type: 1,
            description: "Ping",
            command_scope: "global",
            name_localizations: {fr: "ping"},
            description_localizations: {fr: "Ping"},
        };
        assert.deepEqual(InteractionValidator.validate(data), data);
    });

    it("accepts a guild context menu", () => {
        const data = {name: "Report", type: 3, command_scope: "guild", id: {"123456789012345678": null}};
        assert.deepEqual(InteractionValidator.validate(data), data);
    });

    it("rejects invalid data", () => {
        assert.throws(() => InteractionValidator.validate(false));
        assert.throws(() => InteractionValidator.validate({type: 1, description: "x", command_scope: "global"}));
        assert.throws(() => InteractionValidator.validate({name: "a", type: 1, command_scope: "global"}));
        assert.throws(() => InteractionValidator.validate({name: "a", type: 4, command_scope: "global"}));
        assert.throws(() => InteractionValidator.validate({name: "a", type: 2, command_scope: "guild"}));
        assert.throws(() => InteractionValidator.validate({name: "a", type: 2, command_scope: "global", id: {}}));
        assert.throws(() => InteractionValidator.validate({name: "a", type: 2}));
        assert.throws(() => InteractionValidator.validate({name: "a", type: 2, command_scope: "global", default_member_permissions_string: "Administrator"}));
        assert.throws(() => InteractionValidator.validate({name: "a", type: 2, command_scope: "global", default_member_permissions_string: [8]}));
    });
});
