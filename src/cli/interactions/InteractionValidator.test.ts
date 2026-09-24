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

    it("accepts Discord IDs", () => {
        const guild = {name: "a", type: 2, command_scope: "guild", id: {"123456789012345678": "1234567890123456789", "81384788765712384": null}};
        const global = {name: "a", type: 2, command_scope: "global", id: "1234567890123456789"};
        assert.deepEqual(InteractionValidator.validate(guild), guild);
        assert.deepEqual(InteractionValidator.validate(global), global);
        assert.deepEqual(InteractionValidator.validate({name: "a", type: 2, command_scope: "guild", id: {}}), {name: "a", type: 2, command_scope: "guild", id: {}});
    });

    it("still accepts the empty global ID written by older generators", () => {
        const data = {name: "a", type: 2, command_scope: "global", id: ""};
        assert.deepEqual(InteractionValidator.validate(data), data);
    });

    it("rejects invalid guild and command IDs", () => {
        for (const id of [{"12345": null}, {"my-guild": null}, {"123456789012345678": 42}, {"123456789012345678": "abc"}, {"123456789012345678": ""}]) {
            assert.throws(() => InteractionValidator.validate({name: "a", type: 2, command_scope: "guild", id}), JSON.stringify(id));
        }
        for (const id of ["abc", "123", 1234567890123456789]) {
            assert.throws(() => InteractionValidator.validate({name: "a", type: 2, command_scope: "global", id}), String(id));
        }
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
