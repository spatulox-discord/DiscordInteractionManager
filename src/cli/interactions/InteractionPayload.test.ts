import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {PermissionFlagsBits} from "discord-api-types/v10";
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
            default_member_permissions: null,
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

    it("opens the command to everyone when the names list is emptied", () => {
        const cmd = {
            name: "ping",
            type: 1,
            description: "Ping",
            command_scope: "global",
            default_member_permissions: "8",
            default_member_permissions_string: [],
        } as unknown as Interaction;

        assert.equal(InteractionPayload.toDiscord(cmd).default_member_permissions, null);
    });

    it("keeps administrators only commands restricted", () => {
        for (const bitfield of [0, "0"]) {
            const cmd = {
                name: "admin",
                type: 1,
                description: "Admin",
                command_scope: "global",
                default_member_permissions: bitfield,
                default_member_permissions_string: [],
            } as unknown as Interaction;

            assert.equal(InteractionPayload.toDiscord(cmd).default_member_permissions, "0");
        }
    });

    it("keeps administrators only commands restricted after a round trip", () => {
        const raw = {id: "c1", application_id: "app", version: "v1", type: 1, name: "admin", description: "d", default_member_permissions: "0"} as any;
        assert.equal(InteractionPayload.toDiscord(InteractionPayload.fromDiscord(raw)).default_member_permissions, "0");
    });

    it("sends numeric permissions as a string", () => {
        const cmd = {name: "a", type: 3, command_scope: "global", default_member_permissions: 1099511635968} as unknown as Interaction;
        assert.equal(InteractionPayload.toDiscord(cmd).default_member_permissions, "1099511635968");
    });

    it("never sends a description or options for context menus", () => {
        const cmd = {name: "Report", type: 3, description: "Context menu", options: [], command_scope: "global"} as unknown as Interaction;
        assert.deepEqual(InteractionPayload.toDiscord(cmd), {name: "Report", type: 3, default_member_permissions: null});
    });
});

describe("InteractionPayload.toDiscordPatch", () => {
    it("resets the fields removed from the local file", () => {
        const cmd = {name: "ping", type: 1, description: "Ping", command_scope: "global"} as unknown as Interaction;
        assert.deepEqual(InteractionPayload.toDiscordPatch(cmd), {
            name: "ping", type: 1, description: "Ping",
            name_localizations: null, description_localizations: null, options: [],
            nsfw: false, contexts: null, default_member_permissions: null,
        });
    });

    it("keeps the local values", () => {
        const options = [{type: 3, name: "query", description: "Query"}];
        const cmd = {name: "ping", type: 1, description: "Ping", command_scope: "global", options, nsfw: true} as unknown as Interaction;
        const payload = InteractionPayload.toDiscordPatch(cmd);
        assert.deepEqual(payload.options, options);
        assert.equal(payload.nsfw, true);
    });

    it("never resets slash only fields of a context menu", () => {
        const cmd = {name: "Report", type: 3, command_scope: "global"} as unknown as Interaction;
        const payload = InteractionPayload.toDiscordPatch(cmd);
        assert.equal("options" in payload || "description_localizations" in payload, false);
    });
});

describe("InteractionPayload.fromDiscord", () => {
    const base = {id: "c1", application_id: "app", version: "v1", dm_permission: true, default_member_permissions: null};

    it("keeps options and every Discord field of a slash command", () => {
        const options = [{type: 3, name: "query", description: "Query", required: true}];
        const raw = {...base, type: 1, name: "search", description: "Search", options, nsfw: true, contexts: [0]} as any;

        assert.deepEqual(InteractionPayload.fromDiscord(raw), {
            type: 1, name: "search", description: "Search", options, nsfw: true, contexts: [0],
            dm_permission: true, default_member_permissions: null,
            command_scope: "global", id: "c1",
        });
    });

    it("keeps the permission names", () => {
        const raw = {...base, type: 1, name: "ban", description: "d", default_member_permissions: PermissionFlagsBits.BanMembers.toString()} as any;
        assert.deepEqual(InteractionPayload.fromDiscord(raw).default_member_permissions_string, ["BanMembers"]);
    });

    it("lets the bitfield of a command usable by everyone be edited", () => {
        const cmd = InteractionPayload.fromDiscord({...base, type: 1, name: "ping", description: "d"} as any);
        cmd.default_member_permissions = "8";
        assert.equal(InteractionPayload.toDiscord(cmd).default_member_permissions, "8");
    });

    it("keeps a permission unknown to discord-api-types after a round trip", () => {
        const unknownBit = (1n << 62n).toString();
        const raw = {...base, type: 1, name: "mod", description: "d", default_member_permissions: unknownBit} as any;

        const cmd = InteractionPayload.fromDiscord(raw);

        assert.equal("default_member_permissions_string" in cmd, false);
        assert.equal(InteractionPayload.toDiscord(cmd).default_member_permissions, unknownBit);
    });

    it("stores guild commands with their guild ID", () => {
        const raw = {...base, type: 3, name: "Report", description: "", guild_id: "111"} as any;
        const cmd = InteractionPayload.fromDiscord(raw);

        assert.equal(cmd.command_scope, "guild");
        assert.deepEqual(cmd.id, {"111": "c1"});
        assert.equal("description" in cmd, false);
    });
});
