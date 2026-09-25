import {api, hasToken, onMessages} from "./api.js";
import {$, $$, confirmDialog, h, replace} from "./dom.js";
import {Builder} from "./builder.js";

const state = {
    app: null,
    meta: null,
    guilds: [],
    kind: "commands",
    scope: "global",
    guildId: "",
    includeGlobal: false,
    local: [],
    addable: [], // Guild files that do not target the chosen guild yet
    remote: [],
    selectedDeploy: new Set(),
    selectedUpdate: new Set(),
    selectedRemote: new Set(),
    busy: false, // An action is running: the others wait for it
};

const KIND_LABELS = {commands: "slash command", context_menu: "context menu"};
let editor; // The builder of the editor window

// ---- Log ----

function log(level, message) {
    const time = new Date().toLocaleTimeString();
    const list = $("#log");
    list.append(h("li", {class: `log-${level}`}, h("time", {}, time), h("span", {class: "level"}, level), h("span", {}, message)));
    list.scrollTop = list.scrollHeight;
}

onMessages((messages, error) => {
    for (const {level, message} of messages) log(level, message);
    if (error) {
        log("error", error.message);
        for (const detail of error.data.errors ?? []) log("error", `  ${detail}`);
    }
});

// ---- Status of the interactions ----

const typeLabel = type => type === 1 ? "Slash" : type === 2 ? "User" : "Message";

function deployedGuilds(cmd) {
    return cmd.command_scope === "guild" ? Object.entries(cmd.id ?? {}).filter(([, id]) => id).map(([guildId]) => guildId) : [];
}

function guildName(id) {
    return state.guilds.find(guild => guild.id === id)?.name ?? id;
}

// Deployed in the current scope
function isDeployed(cmd) {
    if (cmd.command_scope === "global") return !!cmd.id;
    if (state.scope === "guild") return !!cmd.id?.[state.guildId];
    return deployedGuilds(cmd).length > 0;
}

function hasAnyId(cmd) {
    return cmd.command_scope === "global" ? !!cmd.id : deployedGuilds(cmd).length > 0;
}

// Guilds of a guild file that it is not deployed in yet
function pendingGuilds(cmd) {
    return cmd.command_scope === "guild" ? Object.entries(cmd.id ?? {}).filter(([, id]) => !id).map(([guildId]) => guildId) : [];
}

/**
 * The local files split by what they need in the current scope:
 * "deploy" (not deployed yet, or guild files not targeting the chosen guild) and "update" (deployed).
 * In All guilds, a file deployed in some of its guilds is in both.
 */
function splitLocalFiles() {
    const {local, scope, guildId} = state;
    if (scope === "global") {
        return {deploy: local.filter(cmd => !cmd.id), update: local.filter(cmd => cmd.id)};
    }
    if (scope === "guild") {
        // The addable listing also has the files that target the guild without being deployed in it
        const targeting = new Set(local.map(cmd => cmd.filename));
        const addable = state.addable.filter(cmd => !targeting.has(cmd.filename)).map(cmd => ({...cmd, addable: true}));
        return {
            deploy: [...local.filter(cmd => !cmd.id?.[guildId]), ...addable],
            update: local.filter(cmd => cmd.id?.[guildId]),
        };
    }
    return {
        deploy: local.filter(cmd => pendingGuilds(cmd).length > 0 || Object.keys(cmd.id ?? {}).length === 0),
        update: local.filter(cmd => deployedGuilds(cmd).length > 0),
    };
}

// A file to deploy that has no guild yet cannot be deployed from All guilds
const canDeploy = cmd => cmd.command_scope === "global" || cmd.addable || state.scope === "guild" || pendingGuilds(cmd).length > 0;

function deployStatus(cmd) {
    if (cmd.addable) return badge("Adds this guild", "info", "This guild is added to the file when it is deployed");
    if (cmd.command_scope === "global") return badge("Not deployed", "muted");
    if (state.scope === "guild") return badge("Pending", "warn", "Not deployed in this guild yet");
    const pending = pendingGuilds(cmd);
    if (pending.length === 0) return badge("No guild", "muted", "Choose its guilds with Edit");
    return badge(`Pending in ${pending.length} guild${pending.length > 1 ? "s" : ""}`, "warn", pending.map(guildName).join("\n"));
}

function updateStatus(cmd) {
    if (cmd.command_scope === "global") return badge("Deployed", "ok", cmd.id);
    if (state.scope === "guild") return badge("Deployed", "ok", cmd.id[state.guildId]);
    const targets = Object.keys(cmd.id);
    const title = targets.map(id => `${guildName(id)}: ${cmd.id[id] ?? "pending"}`).join("\n");
    const deployed = deployedGuilds(cmd).length;
    return badge(`Deployed in ${deployed}/${targets.length} guilds`, deployed === targets.length ? "ok" : "warn", title);
}

function badge(text, tone, title) {
    return h("span", {class: `badge ${tone}`, title}, text);
}

// ---- Tables ----

function table(columns, rows, selection, selectable) {
    if (rows.length === 0) return h("p", {class: "empty"}, "Nothing here");
    const allSelectable = rows.filter(selectable);
    const headCheckbox = h("input", {
        type: "checkbox",
        "aria-label": "Select all",
        checked: allSelectable.length > 0 && allSelectable.every(row => selection.has(row.rowKey)),
        disabled: allSelectable.length === 0,
        onchange: event => {
            for (const row of allSelectable) event.target.checked ? selection.add(row.rowKey) : selection.delete(row.rowKey);
            renderTables();
        },
    });

    return h("table", {},
        h("thead", {}, h("tr", {}, h("th", {class: "check"}, headCheckbox), columns.map(column => h("th", {}, column.label)))),
        h("tbody", {}, rows.map(row => h("tr", {class: selection.has(row.rowKey) ? "selected" : ""},
            h("td", {class: "check"}, h("input", {
                type: "checkbox",
                "aria-label": `Select ${row.name}`,
                checked: selection.has(row.rowKey),
                disabled: !selectable(row),
                onchange: event => {
                    event.target.checked ? selection.add(row.rowKey) : selection.delete(row.rowKey);
                    renderTables();
                },
            })),
            columns.map(column => h("td", {class: column.class}, column.value(row))),
        ))),
    );
}

const nameColumn = {
    label: "Name",
    value: row => h("button", {type: "button", class: "link", onclick: () => showDetails(row)}, row.type === 1 ? `/${row.name}` : row.name),
};
const typeColumn = {label: "Type", value: row => typeLabel(row.type)};
const descriptionColumn = {label: "Description", class: "wide", value: row => row.description ?? ""};
const permissionsColumn = {label: "Permissions", value: row => row.permissions};

function localColumns(status) {
    return [
        nameColumn, typeColumn, descriptionColumn, permissionsColumn,
        {label: "Status", value: status},
        {label: "File", class: "mono", value: row => row.filename},
        {label: "", value: row => h("button", {type: "button", class: "ghost small", disabled: state.busy, onclick: () => openEditor(row.filename)}, "Edit")},
    ];
}

function remoteColumns() {
    if (state.scope === "all") {
        return [
            nameColumn, typeColumn,
            {label: "Guilds", value: row => h("span", {title: deployedGuilds(row).map(guildName).join("\n")}, deployedGuilds(row).length)},
            {label: "Local file", class: "mono", value: row => row.filename ?? h("span", {class: "muted"}, "none")},
        ];
    }
    return [
        nameColumn, typeColumn, descriptionColumn, permissionsColumn,
        {label: "Scope", value: row => row.command_scope === "global" ? badge("Global", "muted") : badge("Guild", "info")},
        {label: "ID", class: "mono", value: row => row.command_scope === "global" ? row.id : row.id[state.guildId]},
    ];
}

function renderTables() {
    const withKey = cmd => ({...cmd, rowKey: cmd.filename});
    const {deploy, update} = splitLocalFiles();
    const remote = state.remote.map(cmd => ({...cmd, rowKey: `${cmd.command_scope}:${cmd.key}`}));
    // Global interactions listed in a guild cannot be deleted from it
    const remoteSelectable = row => state.scope !== "guild" || row.command_scope === "guild";

    replace($("#deploy-table"), table(localColumns(deployStatus), deploy.map(withKey), state.selectedDeploy, canDeploy));
    replace($("#update-table"), table(localColumns(updateStatus), update.map(withKey), state.selectedUpdate, () => true));
    replace($("#remote-table"), table(remoteColumns(), remote, state.selectedRemote, remoteSelectable));
    renderActions();
}

function selectedFiles() {
    const {deploy, update} = splitLocalFiles();
    return {
        deploy: deploy.filter(cmd => state.selectedDeploy.has(cmd.filename) && canDeploy(cmd)),
        update: update.filter(cmd => state.selectedUpdate.has(cmd.filename)),
    };
}

const DEPLOY_HINTS = {
    global: "Global files not deployed yet",
    guild: "Files not deployed in this guild yet, and the guild files that do not target it",
    all: "Guild files still pending in some of their guilds: they are deployed to these guilds",
};
const UPDATE_HINTS = {
    global: "Deployed: push the edits of their file to Discord",
    guild: "Deployed in this guild: push the edits of their file to Discord",
    all: "Deployed in at least one guild: updated in every guild they are deployed in",
};

function selectedRemote() {
    return state.remote.filter(cmd => state.selectedRemote.has(`${cmd.command_scope}:${cmd.key}`));
}

function button(label, onclick, {disabled = false, tone = ""} = {}) {
    return h("button", {type: "button", class: tone, disabled: disabled || state.busy, onclick}, label);
}

function renderActions() {
    const files = selectedFiles();
    const remote = selectedRemote();
    const removable = files.deploy.filter(cmd => !cmd.addable && !hasAnyId(cmd));
    const count = list => list.length ? ` (${list.length})` : "";

    $("#deploy-hint").textContent = DEPLOY_HINTS[state.scope];
    $("#update-hint").textContent = UPDATE_HINTS[state.scope];
    replace($("#deploy-actions"),
        button(`Deploy${count(files.deploy)}`, () => deploy(files.deploy), {disabled: !files.deploy.length}),
        button(`Delete file${count(removable)}`, () => deleteFiles(removable), {disabled: !removable.length, tone: "danger"}),
        button(`New ${KIND_LABELS[state.kind]}`, () => openEditor(null), {tone: "success"}),
    );
    replace($("#update-actions"),
        button(`${state.scope === "all" ? "Update in all their guilds" : "Update"}${count(files.update)}`, () => update(files.update), {disabled: !files.update.length}),
    );

    const remoteActions = [];
    if (state.scope === "guild") {
        remoteActions.push(h("label", {class: "inline"},
            h("input", {type: "checkbox", checked: state.includeGlobal, onchange: event => { state.includeGlobal = event.target.checked; refresh(); }}),
            "Include global"));
    }
    remoteActions.push(button(state.scope === "all" ? `Delete from all guilds${count(remote)}` : `Delete${count(remote)}`, () => deleteRemote(remote), {disabled: !remote.length, tone: "danger"}));
    if (state.scope === "all") {
        remoteActions.push(button("Count per guild", countPerGuild, {tone: "ghost"}));
    } else {
        remoteActions.push(button("Save into files", saveRemote, {tone: "ghost"}));
    }
    replace($("#remote-actions"), remoteActions);
}

function showDetails(cmd) {
    $("#details-title").textContent = cmd.name;
    $("#details-body").textContent = cmd.details.join("\n");
    $("#details").hidden = false;
}

// ---- Loading ----

function scopeQuery() {
    return state.scope === "guild" ? `scope=guild&guild=${state.guildId}` : `scope=${state.scope}`;
}

let loading = 0;

async function refresh() {
    $("#page-folder").textContent = state.app?.folders[state.kind] ?? "";
    const current = ++loading; // Also drops the refresh still running when no guild is chosen
    if (state.scope === "guild" && !state.guildId) {
        state.local = [];
        state.addable = [];
        state.remote = [];
        renderTables();
        return;
    }
    for (const id of ["#deploy-table", "#update-table", "#remote-table"]) replace($(id), h("p", {class: "empty"}, "Loading…"));

    const guildScope = state.scope === "guild";
    const available = guildScope && state.includeGlobal ? "&available=true" : "";
    const [local, addable, remote] = await Promise.all([
        api("GET", `${state.kind}/local?${scopeQuery()}`).catch(() => []),
        guildScope ? api("GET", `${state.kind}/local?${scopeQuery()}&listing=addable`).catch(() => []) : [],
        api("GET", `${state.kind}/remote?${scopeQuery()}${available}`).catch(() => []),
    ]);
    if (current !== loading) return; // A newer refresh is running

    state.local = local;
    state.addable = addable;
    state.remote = remote;
    const filenames = [...local, ...addable].map(cmd => cmd.filename);
    keepExisting(state.selectedDeploy, filenames);
    keepExisting(state.selectedUpdate, filenames);
    keepExisting(state.selectedRemote, remote.map(cmd => `${cmd.command_scope}:${cmd.key}`));
    renderTables();
}

function keepExisting(selection, keys) {
    for (const key of [...selection]) if (!keys.includes(key)) selection.delete(key);
}

// ---- Actions ----

function scopeBody() {
    return state.scope === "guild" ? {scope: "guild", guild: state.guildId} : {scope: state.scope};
}

function whereLabel(action) {
    if (state.scope === "global") return "globally";
    if (state.scope === "guild") return `in the guild "${guildName(state.guildId)}"`;
    return action === "deploy" ? "to the guilds still pending in them" : "in every guild they are deployed in";
}

const names = list => list.map(cmd => cmd.name).join(", ");

// The buttons stay disabled while it runs, even when the tables are rendered again (e.g. a checkbox is clicked)
async function run(action) {
    state.busy = true;
    renderTables();
    try {
        await action();
    } catch {
        // Already in the log
    } finally {
        state.busy = false;
        await refresh();
    }
}

// The guild files that do not target the guild yet are deployed apart, and the guild is added to them
async function deploy(commands) {
    if (!await confirmDialog(`Deploy ${names(commands)} ${whereLabel("deploy")}?`, "Deploy")) return;
    state.selectedDeploy.clear();
    const filenames = list => list.map(cmd => cmd.filename);
    const pending = commands.filter(cmd => !cmd.addable);
    const addable = commands.filter(cmd => cmd.addable);
    await run(async () => {
        if (pending.length) await api("POST", `${state.kind}/deploy`, {...scopeBody(), filenames: filenames(pending)});
        if (addable.length) await api("POST", `${state.kind}/deploy`, {...scopeBody(), filenames: filenames(addable), add: true});
    });
}

async function update(commands) {
    if (!await confirmDialog(`Update ${names(commands)} ${whereLabel("update")} from their local files?`, "Update")) return;
    state.selectedUpdate.clear();
    await run(() => api("POST", `${state.kind}/update`, {...scopeBody(), filenames: commands.map(cmd => cmd.filename)}));
}

async function deleteRemote(commands) {
    const where = state.scope === "guild" ? `from the guild "${guildName(state.guildId)}"` : state.scope === "all" ? "from every guild they are deployed in" : "globally";
    if (!await confirmDialog(`Delete ${names(commands)} ${where}? This cannot be undone.`, "Delete", true)) return;
    state.selectedRemote.clear();
    await run(() => api("POST", `${state.kind}/delete`, {...scopeBody(), keys: commands.map(cmd => cmd.key)}));
}

async function deleteFiles(commands) {
    if (!await confirmDialog(`Delete the files ${commands.map(cmd => cmd.filename).join(", ")}?`, "Delete", true)) return;
    state.selectedDeploy.clear();
    await run(async () => {
        for (const cmd of commands) {
            await api("DELETE", `${state.kind}/files/${encodeURIComponent(cmd.filename)}`);
            log("info", `${cmd.filename} deleted`);
        }
    });
}

async function saveRemote() {
    await run(async () => {
        const {folder} = await api("POST", `${state.kind}/save-remote`, scopeBody());
        log("info", `Saved into ${folder}${state.scope === "guild" ? `/${state.guildId}` : ""}`);
    });
}

async function countPerGuild() {
    const counts = await api("GET", `${state.kind}/count`).catch(() => null);
    if (!counts) return;
    const rows = counts.map(row => h("tr", {}, h("td", {}, `${row.name} (${row.id})`), h("td", {}, row.global), h("td", {}, row.specific), h("td", {}, row.global + row.specific)));
    $("#details-title").textContent = "Per guild";
    replace($("#details-body"), h("table", {},
        h("thead", {}, h("tr", {}, ["Guild", "Global", "Guild", "Total"].map(label => h("th", {}, label)))),
        h("tbody", {}, rows)));
    $("#details").hidden = false;
}

// ---- Navigation ----

const KIND_TITLES = {commands: "Slash commands", context_menu: "Context menus"};

// ---- Editor window ----

// Edits a local file, or creates one without filename
function openEditor(filename) {
    const dialog = $("#editor");
    $("#editor-title").textContent = filename ? `Edit ${filename}` : `New ${KIND_LABELS[state.kind]}`;
    dialog.classList.remove("closing");
    dialog.showModal();
    editor.open(state.kind, filename);
}

// Refused while the changes are unsaved: the bar flashes instead
function closeEditor() {
    const dialog = $("#editor");
    if (!dialog.open || dialog.classList.contains("closing") || !editor.canLeave()) return;
    dialog.classList.add("closing"); // The opening animation reversed, then closed
}

function bindEditor() {
    const dialog = $("#editor");
    $("#editor-close").addEventListener("click", closeEditor);
    // Escape, and a click on the backdrop (the dialog itself, outside of its content)
    dialog.addEventListener("cancel", event => { event.preventDefault(); closeEditor(); });
    dialog.addEventListener("click", event => { if (event.target === dialog) closeEditor(); });
    dialog.addEventListener("animationend", event => {
        if (event.target !== dialog || event.animationName !== "editor-out") return;
        dialog.classList.remove("closing");
        dialog.close();
        refresh();
    });
}

function navigate(kind) {
    if (kind === state.kind) return;
    state.kind = kind;
    state.selectedDeploy.clear();
    state.selectedUpdate.clear();
    state.selectedRemote.clear();
    renderNavigation();
    refresh();
}

function renderNavigation() {
    for (const item of $$(".nav-item")) {
        const current = item.dataset.kind === state.kind;
        item.classList.toggle("active", current);
        if (current) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
    }
    $("#page-title").textContent = KIND_TITLES[state.kind];
    $$("[data-scope]").forEach(tab => tab.classList.toggle("active", tab.dataset.scope === state.scope));
    $(".guild-picker").hidden = state.scope !== "guild";
}

function bindNavigation() {
    $$(".nav-item").forEach(item => item.addEventListener("click", () => navigate(item.dataset.kind)));
    $$("[data-scope]").forEach(tab => tab.addEventListener("click", () => {
        state.scope = tab.dataset.scope;
        state.selectedDeploy.clear();
        state.selectedUpdate.clear();
        state.selectedRemote.clear();
        renderNavigation();
        refresh();
    }));
    $("#guild-select").addEventListener("change", event => {
        state.guildId = event.target.value;
        state.selectedDeploy.clear();
        state.selectedUpdate.clear();
        state.selectedRemote.clear();
        refresh();
    });
    $("#refresh").addEventListener("click", refresh);
    window.addEventListener("beforeunload", event => {
        if ($("#editor").open && editor?.isDirty()) event.preventDefault();
    });
    $("#clear-log").addEventListener("click", () => replace($("#log")));
    $("#details-close").addEventListener("click", () => { $("#details").hidden = true; });
    document.addEventListener("keydown", event => { if (event.key === "Escape") $("#details").hidden = true; });
}

async function start() {
    bindNavigation();
    renderNavigation();
    if (!hasToken()) {
        $("#bot").textContent = "No session token: open the URL printed by \"dim web\" in the terminal";
        return;
    }

    try {
        [state.app, state.meta, state.guilds] = await Promise.all([api("GET", "app"), api("GET", "meta"), api("GET", "guilds")]);
    } catch (error) {
        $("#bot").textContent = error.message;
        return;
    }

    replace($("#bot"), `Connected as ${state.app.name}`, state.app.dev ? h("span", {class: "badge warn"}, "DEV") : null);
    replace($("#guild-select"), h("option", {value: ""}, "Choose a guild"),
        state.guilds.map(guild => h("option", {value: guild.id}, `${guild.name} (${guild.id})`)));

    editor = new Builder($("#editor-body"), {
        meta: state.meta,
        guilds: state.guilds,
        folders: state.app.folders,
        onSaved: filename => {
            // A new file is then edited like the others
            $("#editor-title").textContent = `Edit ${filename}`;
            log("info", `${filename} saved: deploy or update it on Discord to apply it`);
            refresh();
        },
    });
    bindEditor();
    await refresh();
}

start();
