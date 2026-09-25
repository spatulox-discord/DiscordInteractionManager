import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {InteractionRules} from "./InteractionRules";
import {CommandOption, DiscordOptionType} from "../type/InteractionType";

const {SUB_COMMAND, SUB_COMMAND_GROUP, STRING, INTEGER, NUMBER, USER, CHANNEL} = DiscordOptionType;

describe("InteractionRules.isValidName", () => {
    it("accepts lowercase unicode names", () => {
        for (const name of ["ping", "liber-thé", "l'heure", "ping_2", "日本"]) {
            assert.equal(InteractionRules.isValidName(name), true, name);
        }
    });

    it("rejects uppercase, spaces and too long names", () => {
        for (const name of ["", "Ping", "LIBER-THÉ", "my command", "a".repeat(33), "ping!"]) {
            assert.equal(InteractionRules.isValidName(name), false, name);
        }
    });
});

describe("InteractionRules.isValidChoiceValue", () => {
    it("validates choice values against the option type", () => {
        assert.equal(InteractionRules.isValidChoiceValue(STRING, "abc"), true);
        assert.equal(InteractionRules.isValidChoiceValue(INTEGER, "42"), true);
        assert.equal(InteractionRules.isValidChoiceValue(INTEGER, "4.2"), false);
        assert.equal(InteractionRules.isValidChoiceValue(INTEGER, "abc"), false);
        assert.equal(InteractionRules.isValidChoiceValue(NUMBER, "4.2"), true);
        assert.equal(InteractionRules.isValidChoiceValue(NUMBER, " "), false);
    });

    it("keeps choice values within the limits of the option", () => {
        assert.equal(InteractionRules.isValidChoiceValue(INTEGER, "5", {min_value: 1, max_value: 10}), true);
        assert.equal(InteractionRules.isValidChoiceValue(INTEGER, "0", {min_value: 1}), false);
        assert.equal(InteractionRules.isValidChoiceValue(NUMBER, "10.5", {max_value: 10}), false);
        assert.equal(InteractionRules.isValidChoiceValue(STRING, "ab", {min_length: 3}), false);
        assert.equal(InteractionRules.isValidChoiceValue(STRING, "abcd", {max_length: 3}), false);
        assert.equal(InteractionRules.isValidChoiceValue(STRING, "abc", {min_length: 3, max_length: 3}), true);
    });
});

describe("InteractionRules options", () => {
    const option = (type: DiscordOptionType, required?: boolean): CommandOption => ({type, name: `o${type}`, description: "d", required});

    it("only allows subcommands inside a group", () => {
        assert.deepEqual(InteractionRules.allowedOptionTypes(SUB_COMMAND_GROUP, []), [SUB_COMMAND]);
    });

    it("never allows subcommands inside a subcommand", () => {
        const allowed = InteractionRules.allowedOptionTypes(SUB_COMMAND, []);
        assert.equal(allowed.includes(SUB_COMMAND) || allowed.includes(SUB_COMMAND_GROUP), false);
        assert.equal(allowed.includes(STRING), true);
    });

    it("does not mix subcommands and regular options at the same level", () => {
        assert.deepEqual(InteractionRules.allowedOptionTypes(undefined, [option(SUB_COMMAND)]), [SUB_COMMAND, SUB_COMMAND_GROUP]);
        assert.equal(InteractionRules.allowedOptionTypes(undefined, [option(STRING)]).includes(SUB_COMMAND), false);
    });

    it("puts required options first", () => {
        const sorted = InteractionRules.sortRequiredFirst([option(STRING, false), option(USER, true)]);
        assert.deepEqual(sorted.map(o => o.required), [true, false]);
    });
});

describe("InteractionRules.filenameError", () => {
    it("accepts a plain name, with or without its extension", () => {
        assert.equal(InteractionRules.filenameError("ping"), null);
        assert.equal(InteractionRules.filenameError("ping.json"), null);
    });

    it("refuses unsafe, empty and example names", () => {
        for (const name of ["", ".json", "../ping", "a/b", "aux", "example_ping"]) {
            assert.notEqual(InteractionRules.filenameError(name), null, name);
        }
    });
});

describe("InteractionRules.validateForSave", () => {
    const slash = (options?: unknown[]) => ({name: "ping", description: "Ping", type: 1, command_scope: "global", options});

    it("accepts a valid slash command and context menu", () => {
        assert.deepEqual(InteractionRules.validateForSave(slash([
            {type: SUB_COMMAND, name: "add", description: "Add", options: [
                {type: INTEGER, name: "count", description: "Count", required: true, min_value: 1, max_value: 10, choices: [{name: "One", value: 1}]},
                {type: CHANNEL, name: "where", description: "Where", channel_types: [0, 2]},
            ]},
        ])), []);
        assert.deepEqual(InteractionRules.validateForSave({name: "Report user", type: 2, command_scope: "guild", id: {}}), []);
    });

    it("returns the structure error of the validator", () => {
        assert.match(InteractionRules.validateForSave({name: "ping", type: 1})[0]!, /description/);
    });

    it("reports each invalid field with its path", () => {
        const errors = InteractionRules.validateForSave({
            ...slash([
                {type: STRING, name: "Bad Name", description: " "},
                {type: STRING, name: "text", description: "Text", required: true, min_length: 5, max_length: 2,
                    choices: [{name: "A", value: "abc"}, {name: "A", value: 3}]},
                {type: SUB_COMMAND, name: "sub", description: "Sub"},
            ]),
            name: "Ping",
        });
        assert.deepEqual(errors.map(error => error.split(":")[0]), [
            "name",
            "options[0].name",
            "options[0].description",
            "options[1].required",
            "options[1].max_length",
            "options[1].choices[0].value",
            "options[1].choices[1].name",
            "options[1].choices[1].value",
            "options[2].type",
        ]);
    });

    it("refuses duplicate names, empty groups and choices with autocomplete", () => {
        const errors = InteractionRules.validateForSave(slash([
            {type: SUB_COMMAND_GROUP, name: "group", description: "Group", options: []},
            {type: SUB_COMMAND, name: "group", description: "Sub", options: [
                {type: NUMBER, name: "n", description: "N", autocomplete: true, choices: [{name: "One", value: 1}]},
                {type: USER, name: "u", description: "U", channel_types: [0]},
            ]},
        ]));
        assert.deepEqual(errors, [
            "options[0].options: a subcommand group needs at least one subcommand",
            'options[1].name: "group" is already used',
            "options[1].options[0].choices: not allowed with autocomplete",
            "options[1].options[1].channel_types: only CHANNEL options",
        ]);
    });
});
