import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {InteractionDetails} from "./InteractionDetails";
import {Interaction} from "../type/InteractionType";

describe("InteractionDetails.format", () => {
    it("shows every detail of a slash command as a tree", () => {
        const cmd = {
            name: "wiki", type: 1, description: "Search the wiki",
            command_scope: "guild", id: {"111": "c1", "222": null},
            default_member_permissions_string: ["BanMembers"],
            contexts: [0, 1], nsfw: true, filename: "wiki.json",
            name_localizations: {fr: "wiki"}, description_localizations: {fr: "Chercher", de: "Suchen"},
            options: [
                {type: 1, name: "search", description: "Search", options: [
                    {type: 3, name: "query", description: "Query", required: true, min_length: 1, max_length: 100, autocomplete: true},
                    {type: 4, name: "page", description: "Page", min_value: 1, choices: [{name: "First", value: 1}]},
                ]},
                {type: 1, name: "random", description: "Random page", options: [
                    {type: 7, name: "channel", description: "Channel", channel_types: [0, 5]},
                ]},
            ],
        } as unknown as Interaction;

        assert.deepEqual(InteractionDetails.format(cmd), [
            "/wiki — Search the wiki   (Slash, guild, 111 → c1, 222 → not deployed)",
            "Permissions  : BanMembers",
            "Contexts     : SERVER_CHANNEL, BOT_DM",
            "Integration  : Discord default",
            "NSFW         : yes",
            "Localizations: fr (name, description), de (description)",
            "File         : wiki.json",
            "Options:",
            "  ├─ search (SUB_COMMAND) — Search",
            "  │  ├─ query (STRING, required, length 1-100, autocomplete) — Query",
            "  │  └─ page (INTEGER, min 1) — Page",
            "  │     choices: First = 1",
            "  └─ random (SUB_COMMAND) — Random page",
            "     └─ channel (CHANNEL, channels: Text / Announcement) — Channel",
        ]);
    });

    it("shows a context menu without options", () => {
        const cmd = {name: "Report", type: 3, command_scope: "global", default_member_permissions: "0", integration_types: [0, 1]} as unknown as Interaction;

        assert.deepEqual(InteractionDetails.format(cmd), [
            "Report   (Message Context Menu, global, ID not deployed)",
            "Permissions  : Administrators only",
            "Contexts     : Discord default",
            "Integration  : GUILD_INSTALL, USER_INSTALL",
            "NSFW         : no",
        ]);
    });

    it("says when a slash command has no option and everyone can use it", () => {
        const lines = InteractionDetails.format({name: "ping", type: 1, description: "Ping", command_scope: "global", id: "c1"} as unknown as Interaction);

        assert.equal(lines[0], "/ping — Ping   (Slash, global, ID c1)");
        assert.equal(lines[1], "Permissions  : Everyone");
        assert.equal(lines.at(-1), "Options      : none");
    });
});
