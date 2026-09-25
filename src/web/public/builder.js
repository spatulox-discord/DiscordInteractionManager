import {api} from "./api.js";
import {confirmDialog, h, replace} from "./dom.js";

// Same values as DiscordOptionType
const T = {SUB_COMMAND: 1, SUB_COMMAND_GROUP: 2, STRING: 3, INTEGER: 4, BOOLEAN: 5, USER: 6, CHANNEL: 7, ROLE: 8, MENTIONABLE: 9, NUMBER: 10, ATTACHMENT: 11};
const MAX_OPTIONS = 25;
const MAX_CHOICES = 25;
const MAX_STRING_LENGTH = 6000;
const VALIDATION_DELAY_MS = 400;

const isSubcommand = type => type === T.SUB_COMMAND || type === T.SUB_COMMAND_GROUP;
const isNumeric = type => type === T.INTEGER || type === T.NUMBER;
const clone = value => JSON.parse(JSON.stringify(value));
const byRequiredFirst = (a, b) => Number(!!b.required) - Number(!!a.required);

// Discord wants the required options first: the form keeps the order they are saved in
function sortRequiredFirst(options) {
    if (options.some(option => isSubcommand(option.type))) return;
    options.splice(0, options.length, ...[...options].sort(byRequiredFirst));
}

function sortEveryLevel(options = []) {
    sortRequiredFirst(options);
    for (const option of options) sortEveryLevel(option.options);
}

// Same rule as InteractionRules.allowedOptionTypes, from the other options of the level
function allowedTypes(parent, others, allTypes) {
    if (parent === T.SUB_COMMAND_GROUP) return [T.SUB_COMMAND];
    if (parent === T.SUB_COMMAND) return allTypes.filter(type => !isSubcommand(type));
    const first = others[0];
    if (!first) return allTypes;
    return allTypes.filter(type => isSubcommand(type) === isSubcommand(first.type));
}

/**
 * Creates and edits interaction files. The fields it does not know (e.g. localizations) are kept as they are.
 */
export class Builder {
    constructor(root, {meta, guilds, folders, onSaved}) {
        this.root = root;
        this.meta = meta;
        this.guilds = guilds;
        this.folders = folders;
        this.onSaved = onSaved;
        this.optionTypeNames = Object.fromEntries(meta.optionTypes.map(({name, value}) => [value, name]));
        this.allTypes = meta.optionTypes.map(({value}) => value);
        this.permissionFilter = "";
        this.guildFilter = "";

        // Outside of the rendered content, so a render does not replay its animation
        this.content = h("div");
        this.unsavedBar = h("div", {class: "unsaved-bar", role: "status", hidden: true, onanimationend: event => this.barAnimationEnded(event)},
            h("span", {}, "Careful, you have unsaved changes!"),
            h("div", {class: "actions"},
                h("button", {type: "button", class: "text-button", onclick: () => this.reset()}, "Reset"),
                this.saveButton = h("button", {type: "button", class: "success", title: "Ctrl+S", onclick: () => this.save()}, "Save Changes"),
            ),
        );
        root.append(this.content, this.unsavedBar);
    }

    async open(kind, filename) {
        this.opening = null;
        clearTimeout(this.validationTimer);
        this.validation = null;
        this.kind = kind;
        this.errors = [];
        this.permissionFilter = "";
        this.guildFilter = "";
        this.filename = filename ?? "";
        this.existing = !!filename;
        this.original = null;
        // Nothing to lose until it is loaded: the previous interaction would look changed and keep the window open
        this.cmd = undefined;

        if (filename) {
            const opening = this.opening = Symbol(filename);
            replace(this.content, h("p", {class: "empty"}, "Loading…"));
            let original;
            try {
                original = await api("GET", `${kind}/files/${encodeURIComponent(filename)}`);
            } catch (error) {
                if (opening === this.opening) replace(this.content, h("p", {class: "empty"}, `${filename} cannot be opened: ${error.message}`));
                return;
            }
            if (opening !== this.opening) return; // Closed, and another file opened meanwhile
            this.original = original;
            this.cmd = clone(original);
            sortEveryLevel(this.cmd.options);
            this.filename = filename.replace(/\.json$/i, "");
        } else {
            this.cmd = kind === "commands"
                ? {name: "", description: "", type: 1, command_scope: "global"}
                : {name: "", type: 2, command_scope: "global"};
        }
        this.permissionMode = this.detectPermissionMode();
        this.keepAsSaved();
        this.render();
    }

    // ---- Unsaved changes ----

    // The state that Reset goes back to
    keepAsSaved() {
        this.savedState = {cmd: clone(this.cmd), filename: this.filename, permissionMode: this.permissionMode};
        this.saved = this.snapshot();
    }

    snapshot() {
        return JSON.stringify([this.filename.trim(), this.output()]);
    }

    // Changed since it was opened or saved
    isDirty() {
        return this.cmd !== undefined && this.snapshot() !== this.saved;
    }

    // Slides in when shown, and out (the same animation reversed) before being hidden
    showBar(visible) {
        const bar = this.unsavedBar;
        if (visible) {
            // Only when it appears: removing the flash of canLeave must not play it again
            if (bar.hidden || bar.classList.contains("leaving")) bar.classList.add("entering");
            bar.classList.remove("leaving");
            bar.hidden = false;
        } else if (!bar.hidden) {
            bar.classList.remove("alert", "entering");
            bar.classList.add("leaving");
        }
    }

    barAnimationEnded(event) {
        if (event.animationName === "bar-out") {
            this.unsavedBar.hidden = true;
            this.unsavedBar.classList.remove("leaving");
        } else if (event.animationName === "bar-shake") {
            this.unsavedBar.classList.remove("alert");
        } else if (event.animationName === "bar-in") {
            this.unsavedBar.classList.remove("entering");
        }
    }

    reset() {
        const {cmd, filename, permissionMode} = this.savedState;
        this.cmd = clone(cmd);
        this.filename = filename;
        this.permissionMode = permissionMode;
        this.errors = [];
        this.render();
    }

    /**
     * As on Discord, the builder cannot be left with unsaved changes: the bar flashes instead.
     * @returns true when there is nothing to lose
     */
    canLeave() {
        if (!this.isDirty()) return true;
        const bar = this.unsavedBar;
        bar.classList.remove("alert", "entering");
        void bar.offsetWidth; // Restarts the animation
        bar.classList.add("alert");
        return false;
    }

    // ---- State helpers ----

    detectPermissionMode() {
        const {default_member_permissions_string: names, default_member_permissions: bitfield} = this.cmd;
        if (Array.isArray(names) && names.length > 0) return "specific";
        if (bitfield !== undefined && bitfield !== null && String(bitfield) === "0") return "admins";
        if (!Array.isArray(names) && bitfield !== undefined && bitfield !== null) return "custom";
        return "everyone";
    }

    // Same as Utils.permissionsToBitfield, undefined for an unknown name (the server reports it)
    bitfield(names) {
        let bits = 0n;
        for (const name of names) {
            const bit = this.meta.permissionBits[name];
            if (bit === undefined) return undefined;
            bits |= BigInt(bit);
        }
        return bits.toString();
    }

    // Where the original file is deployed: "global" or guild IDs
    deployed() {
        const cmd = this.original;
        if (!cmd) return [];
        if (cmd.command_scope === "global") return cmd.id ? ["global"] : [];
        return Object.entries(cmd.id ?? {}).filter(([, id]) => id).map(([guildId]) => guildId);
    }

    // The interaction as it will be saved
    output() {
        const cmd = clone(this.cmd);
        if (typeof cmd.name === "string") cmd.name = cmd.name.trim();
        if (typeof cmd.description === "string") cmd.description = cmd.description.trim();

        switch (this.permissionMode) {
            case "everyone":
                delete cmd.default_member_permissions_string;
                delete cmd.default_member_permissions;
                break;
            case "admins":
                delete cmd.default_member_permissions_string;
                cmd.default_member_permissions = "0";
                break;
            case "specific":
                if (!cmd.default_member_permissions_string?.length) {
                    delete cmd.default_member_permissions_string;
                    delete cmd.default_member_permissions;
                } else {
                    cmd.default_member_permissions = this.bitfield(cmd.default_member_permissions_string) ?? cmd.default_member_permissions;
                }
                break;
            // custom: the bitfield of the file is kept
        }

        for (const field of ["contexts", "integration_types"]) {
            if (Array.isArray(cmd[field]) && cmd[field].length === 0) delete cmd[field];
        }
        if (!cmd.nsfw) delete cmd.nsfw;

        if (cmd.command_scope === "global") {
            if (!this.deployed().includes("global")) delete cmd.id;
        } else {
            cmd.id ??= {};
        }

        if (cmd.type === 1) {
            cmd.options = this.cleanOptions(cmd.options ?? []);
            if (cmd.options.length === 0) delete cmd.options;
        }
        return cmd;
    }

    cleanOptions(options) {
        const cleaned = options.map(option => {
            const result = {...option, name: option.name.trim(), description: option.description.trim()};
            if (isSubcommand(option.type)) {
                result.options = this.cleanOptions(option.options ?? []);
                if (option.type === T.SUB_COMMAND && result.options.length === 0) delete result.options;
                delete result.required;
                return result;
            }
            if (!result.required) result.required = false;
            if (Array.isArray(result.choices) && result.choices.length === 0) delete result.choices;
            if (Array.isArray(result.channel_types) && result.channel_types.length === 0) delete result.channel_types;
            if (!result.autocomplete) delete result.autocomplete;
            return result;
        });
        // Discord wants the required options first, as the CLI generator sorts them
        if (cleaned.some(option => isSubcommand(option.type))) return cleaned;
        return [...cleaned].sort(byRequiredFirst);
    }

    // ---- Rendering ----

    render() {
        const isSlash = this.cmd.type === 1;
        replace(this.content,
            h("div", {class: "builder"},
                h("div", {class: "builder-form"},
                    this.fileSection(),
                    this.baseSection(isSlash),
                    this.permissionsSection(),
                    this.availabilitySection(),
                    this.scopeSection(),
                    isSlash ? this.optionsSection() : null,
                ),
                h("aside", {class: "builder-side"},
                    h("div", {class: "panel sticky"},
                        h("div", {class: "panel-head"}, h("h2", {}, "Preview")),
                        this.errorsBox = h("ul", {class: "errors"}),
                        this.previewBox = h("pre", {class: "preview mono"}),
                    ),
                ),
            ),
        );
        this.refreshSide();
    }

    refreshSide() {
        this.previewBox.textContent = JSON.stringify(this.output(), null, 2);
        this.showBar(this.isDirty());
        this.renderErrors();
        this.validateSoon();
    }

    renderErrors() {
        replace(this.errorsBox, this.errors.map(error => h("li", {}, error)));
        this.errorsBox.hidden = this.errors.length === 0;
    }

    /**
     * Checks the changes with the rules of the save, a moment after the last one.
     * Nothing is shown before the first change, so a new interaction does not open full of errors.
     */
    validateSoon() {
        clearTimeout(this.validationTimer);
        const check = this.validation = Symbol("validation");
        if (!this.isDirty()) {
            this.errors = [];
            return this.renderErrors();
        }
        this.validationTimer = setTimeout(async () => {
            const filename = this.filename.trim();
            const body = {interaction: this.output(), filename: this.existing || !filename ? undefined : filename};
            const result = await api("POST", `${this.kind}/validate`, body).catch(() => null);
            if (!result || check !== this.validation) return; // Changed again meanwhile
            this.errors = [...!this.existing && !filename ? ["File name: required"] : [], ...result.errors];
            this.renderErrors();
        }, VALIDATION_DELAY_MS);
    }

    section(title, ...children) {
        return h("section", {class: "panel"}, h("div", {class: "panel-head"}, h("h2", {}, title)), h("div", {class: "panel-body"}, children));
    }

    // A text input bound to object[field]
    text(object, field, {label, max, hint, placeholder, disabled} = {}) {
        const counter = max ? h("span", {class: "muted counter"}) : null;
        const updateCounter = () => { if (counter) counter.textContent = `${(object[field] ?? "").trim().length}/${max}`; };
        updateCounter();
        return h("label", {class: "field"},
            h("span", {class: "label"}, label, counter),
            h("input", {
                type: "text",
                value: object[field] ?? "",
                maxlength: max ? max + 20 : undefined,
                placeholder,
                disabled,
                oninput: event => { object[field] = event.target.value; updateCounter(); this.refreshSide(); },
            }),
            hint ? h("span", {class: "hint"}, hint) : null,
        );
    }

    // A number input bound to object[field], removed when empty
    number(object, field, label, {integer = false, min, max} = {}) {
        return h("label", {class: "field small"},
            h("span", {class: "label"}, label),
            h("input", {
                type: "number",
                value: object[field] ?? "",
                step: integer ? 1 : "any",
                min, max,
                oninput: event => {
                    const value = event.target.value.trim();
                    if (value === "") delete object[field]; else object[field] = Number(value);
                    this.refreshSide();
                },
            }),
        );
    }

    checkbox(label, checked, onchange, {disabled = false, title} = {}) {
        return h("label", {class: "check-label", title},
            h("input", {type: "checkbox", checked, disabled, onchange: event => onchange(event.target.checked)}),
            label);
    }

    // Checkboxes of a numeric enum, bound to object[field]
    enumChecks(object, field, entries) {
        const values = new Set(object[field] ?? []);
        return h("div", {class: "checks"}, entries.map(({name, value}) => this.checkbox(name, values.has(value), checked => {
            checked ? values.add(value) : values.delete(value);
            object[field] = entries.map(entry => entry.value).filter(entryValue => values.has(entryValue));
            this.refreshSide();
        })));
    }

    fileSection() {
        return this.section("File",
            this.text(this, "filename", {
                label: "File name",
                disabled: this.existing,
                hint: this.existing
                    ? `${this.folders[this.kind]}/${this.filename}.json`
                    : `Saved in ${this.folders[this.kind]}/. Names starting with "example" are ignored`,
                placeholder: "ping",
            }),
        );
    }

    baseSection(isSlash) {
        const cmd = this.cmd;
        const deployed = this.deployed().length > 0;
        return this.section("Interaction",
            isSlash ? null : h("div", {class: "field"},
                h("span", {class: "label"}, "Type"),
                h("div", {class: "segmented"}, [[2, "User"], [3, "Message"]].map(([type, label]) => h("button", {
                    type: "button",
                    class: cmd.type === type ? "active" : "",
                    disabled: deployed && cmd.type !== type,
                    title: deployed ? "Delete it from Discord to change its type" : undefined,
                    onclick: () => { cmd.type = type; this.render(); },
                }, label))),
            ),
            this.text(cmd, "name", isSlash
                ? {label: "Name", max: 32, hint: "Lowercase letters, digits, - _ ', no space", placeholder: "ping"}
                : {label: "Name", max: 32, hint: "Shown in the Apps menu, spaces and capitals allowed", placeholder: "Report message"}),
            isSlash ? this.text(cmd, "description", {label: "Description", max: 100, placeholder: "Replies with pong"}) : null,
            this.checkbox("NSFW (age-restricted channels only)", !!cmd.nsfw, checked => { cmd.nsfw = checked; this.refreshSide(); }),
        );
    }

    permissionsSection() {
        const cmd = this.cmd;
        const modes = [["everyone", "Everyone"], ["admins", "Administrators only"], ["specific", "Members with permissions"]];
        if (this.permissionMode === "custom") modes.push(["custom", `Bitfield ${cmd.default_member_permissions} (from the file)`]);

        const radios = h("div", {class: "checks"}, modes.map(([mode, label]) => h("label", {class: "check-label"},
            h("input", {
                type: "radio",
                name: "permission-mode",
                checked: this.permissionMode === mode,
                onchange: () => {
                    this.permissionMode = mode;
                    if (mode === "specific") cmd.default_member_permissions_string ??= [];
                    this.render();
                },
            }),
            label)));

        let list = null;
        if (this.permissionMode === "specific") {
            const selected = new Set(cmd.default_member_permissions_string ?? []);
            const items = h("div", {class: "checks grid"});
            const renderItems = () => replace(items, this.meta.permissions
                .filter(name => name.toLowerCase().includes(this.permissionFilter.toLowerCase()) || selected.has(name))
                .map(name => this.checkbox(name, selected.has(name), checked => {
                    checked ? selected.add(name) : selected.delete(name);
                    cmd.default_member_permissions_string = this.meta.permissions.filter(permission => selected.has(permission));
                    this.refreshSide();
                })));
            renderItems();
            list = h("div", {},
                h("input", {type: "search", placeholder: "Filter permissions", value: this.permissionFilter, oninput: event => {
                    this.permissionFilter = event.target.value;
                    renderItems();
                }}),
                items,
                h("p", {class: "hint"}, "Members need every checked permission. Server admins can still change it in the server settings."),
            );
        }
        return this.section("Permissions", radios, list);
    }

    availabilitySection() {
        return this.section("Availability",
            h("div", {class: "field"}, h("span", {class: "label"}, "Contexts"), this.enumChecks(this.cmd, "contexts", this.meta.contexts),
                h("span", {class: "hint"}, "None checked: Discord's default")),
            h("div", {class: "field"}, h("span", {class: "label"}, "Integration types"), this.enumChecks(this.cmd, "integration_types", this.meta.integrationTypes),
                h("span", {class: "hint"}, "None checked: the integration types of the application")),
        );
    }

    scopeSection() {
        const cmd = this.cmd;
        const deployed = this.deployed();
        const locked = deployed.length > 0;

        const scopes = h("div", {class: "segmented"}, [["global", "Global"], ["guild", "Guild specific"]].map(([scope, label]) => h("button", {
            type: "button",
            class: cmd.command_scope === scope ? "active" : "",
            disabled: locked && cmd.command_scope !== scope,
            title: locked ? "Delete it from Discord to change its scope" : undefined,
            onclick: () => {
                cmd.command_scope = scope;
                if (scope === "guild") cmd.id = {}; else delete cmd.id;
                this.render();
            },
        }, label)));

        let guilds = null;
        if (cmd.command_scope === "guild") {
            cmd.id ??= {};
            const known = new Set(this.guilds.map(guild => guild.id));
            const entries = [...this.guilds, ...Object.keys(cmd.id).filter(id => !known.has(id)).map(id => ({id, name: "Unknown guild"}))];

            // Filtered by name or ID, the checked guilds staying visible, as the permissions
            const items = h("div", {class: "checks grid"});
            const renderItems = () => {
                const search = this.guildFilter.trim().toLowerCase();
                const shown = entries.filter(guild => !search || guild.id in cmd.id
                    || guild.name.toLowerCase().includes(search) || guild.id.includes(search));
                replace(items, shown.length === 0 ? h("p", {class: "hint"}, "No guild matches") : shown.map(guild => {
                    const isDeployed = deployed.includes(guild.id);
                    return this.checkbox([guild.name, isDeployed ? " (deployed)" : "", h("span", {class: "guild-id mono"}, guild.id)], guild.id in cmd.id, checked => {
                        if (checked) cmd.id[guild.id] = null; else delete cmd.id[guild.id];
                        this.refreshSide();
                    }, {disabled: isDeployed, title: isDeployed ? "Delete it from this guild first (Guild scope of the list)" : undefined});
                }));
            };
            renderItems();

            guilds = h("div", {class: "field"},
                h("span", {class: "label"}, "Guilds"),
                entries.length === 0 ? h("p", {class: "hint"}, "The bot is in no guild") : [
                    h("input", {type: "search", placeholder: "Search a guild by name or ID", "aria-label": "Search a guild", value: this.guildFilter, oninput: event => {
                        this.guildFilter = event.target.value;
                        renderItems();
                    }}),
                    items,
                ],
                h("span", {class: "hint"}, "Checked guilds stay pending until you deploy them from the Guild scope of the list"),
            );
        }
        return this.section("Scope", scopes, guilds);
    }

    optionsSection() {
        this.cmd.options ??= [];
        return this.section("Options", this.optionList(this.cmd.options, undefined));
    }

    optionList(options, parentType) {
        const add = () => {
            // A text option when it is allowed, the most common one, else a subcommand
            const allowed = allowedTypes(parentType, options, this.allTypes);
            const type = allowed.includes(T.STRING) ? T.STRING : allowed[0];
            options.push(isSubcommand(type) ? {type, name: "", description: "", options: []} : {type, name: "", description: "", required: false});
            this.render();
        };
        const addLabel = parentType === T.SUB_COMMAND_GROUP ? "Add subcommand" : "Add option";
        return h("div", {class: "options"},
            options.length === 0 && parentType === undefined ? h("p", {class: "hint"}, "No option: the command is used as is. Add subcommands to group actions, or options to ask for values.") : null,
            options.map((option, index) => this.optionCard(options, index, parentType)),
            h("button", {type: "button", class: "ghost small", disabled: options.length >= MAX_OPTIONS, onclick: add},
                options.length >= MAX_OPTIONS ? `${MAX_OPTIONS} options at most` : `+ ${addLabel}`),
        );
    }

    optionCard(options, index, parentType) {
        const option = options[index];
        const others = options.filter((_, otherIndex) => otherIndex !== index);
        const allowed = allowedTypes(parentType, others, this.allTypes);
        if (!allowed.includes(option.type)) allowed.unshift(option.type);

        const move = offset => {
            const [moved] = options.splice(index, 1);
            options.splice(index + offset, 0, moved);
            this.render();
        };
        // A required option cannot go below an optional one, nor an optional one above a required one
        const canMove = offset => {
            const other = options[index + offset];
            return !!other && (isSubcommand(option.type) || !!other.required === !!option.required);
        };
        const moveTitle = offset => options[index + offset] && !canMove(offset) ? "Required options always come first" : undefined;

        const header = h("div", {class: "option-head"},
            h("select", {
                "aria-label": "Option type",
                onchange: event => { this.changeType(option, Number(event.target.value)); this.render(); },
            }, allowed.map(type => h("option", {value: type, selected: type === option.type ? "selected" : null}, this.optionTypeNames[type]))),
            h("span", {class: "option-name mono"}, option.name || "(no name)"),
            h("div", {class: "actions"},
                h("button", {type: "button", class: "ghost small", disabled: !canMove(-1), title: moveTitle(-1), onclick: () => move(-1), "aria-label": "Move up"}, "↑"),
                h("button", {type: "button", class: "ghost small", disabled: !canMove(1), title: moveTitle(1), onclick: () => move(1), "aria-label": "Move down"}, "↓"),
                h("button", {type: "button", class: "ghost small danger-text", onclick: () => { options.splice(index, 1); this.render(); }}, "Remove"),
            ),
        );

        const fields = h("div", {class: "option-fields"},
            this.text(option, "name", {label: "Name", max: 32, placeholder: "name"}),
            this.text(option, "description", {label: "Description", max: 100}),
        );

        let body = null;
        if (isSubcommand(option.type)) {
            option.options ??= [];
            body = h("div", {class: "nested"}, this.optionList(option.options, option.type));
        } else {
            body = h("div", {class: "option-extra"},
                this.checkbox("Required", !!option.required, checked => {
                    option.required = checked;
                    sortRequiredFirst(options);
                    this.render();
                }),
                this.typeFields(option),
            );
        }
        return h("div", {class: "option-card"}, header, fields, body);
    }

    // Removes the fields the new type cannot have
    changeType(option, type) {
        option.type = type;
        if (isSubcommand(type)) {
            for (const field of ["required", "choices", "min_length", "max_length", "min_value", "max_value", "channel_types", "autocomplete"]) delete option[field];
            option.options ??= [];
            if (type === T.SUB_COMMAND_GROUP) option.options = option.options.filter(child => child.type === T.SUB_COMMAND);
            else option.options = option.options.filter(child => !isSubcommand(child.type));
            return;
        }
        delete option.options;
        if (type !== T.STRING) { delete option.min_length; delete option.max_length; }
        if (!isNumeric(type)) { delete option.min_value; delete option.max_value; }
        if (type !== T.STRING && !isNumeric(type)) { delete option.choices; delete option.autocomplete; }
        if (type !== T.CHANNEL) delete option.channel_types;
        // Choice values of another type would be invalid. A text that is no number is emptied, to be filled again
        const toNumber = value => String(value ?? "").trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : "";
        if (option.choices) option.choices = option.choices.map(choice => ({...choice, value: type === T.STRING ? String(choice.value ?? "") : toNumber(choice.value)}));
    }

    typeFields(option) {
        const type = option.type;
        const parts = [];
        if (type === T.STRING || isNumeric(type)) {
            parts.push(this.checkbox("Autocomplete (the bot suggests the values, no choices)", !!option.autocomplete, checked => {
                option.autocomplete = checked;
                if (checked) delete option.choices;
                this.render();
            }));
        }
        if (type === T.STRING) {
            parts.push(h("div", {class: "row"},
                this.number(option, "min_length", "Min length", {integer: true, min: 0, max: MAX_STRING_LENGTH}),
                this.number(option, "max_length", "Max length", {integer: true, min: 1, max: MAX_STRING_LENGTH})));
        }
        if (isNumeric(type)) {
            const integer = type === T.INTEGER;
            parts.push(h("div", {class: "row"},
                this.number(option, "min_value", "Min value", {integer}),
                this.number(option, "max_value", "Max value", {integer})));
        }
        if ((type === T.STRING || isNumeric(type)) && !option.autocomplete) parts.push(this.choices(option));
        if (type === T.CHANNEL) {
            parts.push(h("div", {class: "field"}, h("span", {class: "label"}, "Channel types"),
                this.enumChecks(option, "channel_types", this.meta.channelTypes),
                h("span", {class: "hint"}, "None checked: every channel type")));
        }
        return parts;
    }

    choices(option) {
        option.choices ??= [];
        const choices = option.choices;
        const numeric = isNumeric(option.type);
        return h("div", {class: "field"},
            h("span", {class: "label"}, "Choices", h("span", {class: "muted counter"}, "The user must pick one of them")),
            choices.map((choice, index) => h("div", {class: "row choice"},
                h("input", {type: "text", placeholder: "Name shown", "aria-label": "Choice name", value: choice.name, oninput: event => { choice.name = event.target.value; this.refreshSide(); }}),
                h("input", {
                    type: numeric ? "number" : "text",
                    step: option.type === T.INTEGER ? 1 : "any",
                    placeholder: "Value sent to the bot",
                    "aria-label": "Choice value",
                    value: choice.value ?? "",
                    oninput: event => {
                        const raw = event.target.value;
                        choice.value = numeric && raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
                        this.refreshSide();
                    },
                }),
                h("button", {type: "button", class: "ghost small danger-text", "aria-label": "Remove choice", onclick: () => { choices.splice(index, 1); this.render(); }}, "✕"),
            )),
            h("button", {
                type: "button",
                class: "ghost small",
                disabled: choices.length >= MAX_CHOICES,
                onclick: () => { choices.push({name: "", value: numeric ? 0 : ""}); this.render(); },
            }, choices.length >= MAX_CHOICES ? `${MAX_CHOICES} choices at most` : "+ Add choice"),
        );
    }

    // ---- Saving ----

    // One save at a time: a double click would otherwise find the file just created and ask to overwrite it
    async save(overwrite = this.existing) {
        if (this.saving) return;
        const filename = this.filename.trim().replace(/\.json$/i, "");
        this.errors = [];
        if (!filename) this.errors.push("File name: required");
        if (this.errors.length) return this.refreshSide();

        this.saving = true;
        this.saveButton.disabled = true;
        let exists = false;
        try {
            const saved = await api("PUT", `${this.kind}/files/${encodeURIComponent(filename)}`, {interaction: this.output(), overwrite});
            this.existing = true;
            this.filename = saved.filename.replace(/\.json$/i, "");
            this.original = saved.interaction;
            this.cmd = clone(saved.interaction);
            this.permissionMode = this.detectPermissionMode();
            this.keepAsSaved();
            this.render();
            this.onSaved(saved.filename);
        } catch (error) {
            exists = error.status === 409 && error.data.exists && !overwrite;
            if (!exists) {
                this.errors = error.data.errors ?? [error.message];
                this.refreshSide();
            }
        } finally {
            this.saving = false;
            this.saveButton.disabled = false;
        }
        if (exists && await confirmDialog(`${filename}.json already exists. Overwrite it?`, "Overwrite", true)) await this.save(true);
    }
}
