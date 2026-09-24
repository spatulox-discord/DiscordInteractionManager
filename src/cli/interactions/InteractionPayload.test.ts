import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {PermissionFlagsBits} from "discord.js";
import {InteractionPayload} from "./InteractionPayload";
import {Interaction} from "../type/InteractionType";

describe("InteractionPayload.toDiscord", () => {
    it("only sends Discord fields", () => {
        const cmd = {
            name: "ping",
            type: 1,
            description: "Ping",
            name_localizations: {fr: "ping"},
            command_scope: "guild",
            id: {"123456789012345678": null},
            filename: "ping.json",
            permissionsComment: "local only",
        } as unknown as Interaction;

        assert.deepEqual(InteractionPayload.toDiscord(cmd), {
            name: "ping",
            type: 1,
            description: "Ping",
            name_localizations: {fr: "ping"},
        });
    });

    it("computes permissions from their names", () => {
        const cmd = {
            name: "ban",
            type: 1,
            description: "Ban",
            command_scope: "global",
            default_member_permissions: "8",
            default_member_permissions_string: ["BanMembers"],
        } as unknown as Interaction;

        assert.equal(InteractionPayload.toDiscord(cmd).default_member_permissions, PermissionFlagsBits.BanMembers.toString());
    });

    it("drops permissions when the names list is empty", () => {
        const cmd = {
            name: "ping",
            type: 1,
            description: "Ping",
            command_scope: "global",
            default_member_permissions: 0,
            default_member_permissions_string: [],
        } as unknown as Interaction;

        assert.equal("default_member_permissions" in InteractionPayload.toDiscord(cmd), false);
    });

    it("sends numeric permissions as a string", () => {
        const cmd = {name: "a", type: 3, command_scope: "global", default_member_permissions: 1099511635968} as unknown as Interaction;
        assert.equal(InteractionPayload.toDiscord(cmd).default_member_permissions, "1099511635968");
    });

    it("never sends a description or options for context menus", () => {
        const cmd = {name: "Report", type: 3, description: "Context menu", options: [], command_scope: "global"} as unknown as Interaction;
        assert.deepEqual(InteractionPayload.toDiscord(cmd), {name: "Report", type: 3});
    });
});
