import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {PermissionFlagsBits} from "discord.js";
import {Utils} from "./Utils";

describe("Utils.permissionsToBitfield", () => {
    it("returns undefined for an empty or missing list", () => {
        assert.equal(Utils.permissionsToBitfield(undefined), undefined);
        assert.equal(Utils.permissionsToBitfield([]), undefined);
    });

    it("combines permission names into a bitfield string", () => {
        const expected = (PermissionFlagsBits.KickMembers | PermissionFlagsBits.BanMembers).toString();
        assert.equal(Utils.permissionsToBitfield(["KickMembers", "BanMembers"]), expected);
    });
});

describe("Utils.bitfieldToPermissions", () => {
    it("returns an empty list for an empty bitfield", () => {
        assert.deepEqual(Utils.bitfieldToPermissions(null), []);
        assert.deepEqual(Utils.bitfieldToPermissions("0"), []);
    });

    it("decodes a bitfield into permission names", () => {
        const bitfield = (PermissionFlagsBits.KickMembers | PermissionFlagsBits.BanMembers).toString();
        assert.deepEqual(Utils.bitfieldToPermissions(bitfield), ["KickMembers", "BanMembers"]);
    });
});

describe("Utils.permissionEntries", () => {
    it("lists each permission once, under its current name", () => {
        const names = Utils.permissionEntries().map(([name]) => name);
        assert.equal(names.includes("ManageGuildExpressions"), true);
        assert.equal(names.includes("ManageEmojisAndStickers"), false);
        assert.deepEqual(Utils.bitfieldToPermissions(PermissionFlagsBits.ManageGuildExpressions), ["ManageGuildExpressions"]);
    });

    it("still accepts deprecated names", () => {
        assert.equal(Utils.permissionsToBitfield(["ManageEmojisAndStickers"]), PermissionFlagsBits.ManageGuildExpressions.toString());
    });
});
