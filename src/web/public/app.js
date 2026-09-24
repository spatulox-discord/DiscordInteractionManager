import {api, hasToken, onMessages} from "./api.js";
import {$, $$, confirmDialog, h, replace} from "./dom.js";
import {Builder} from "./builder.js";

const state = {
    app: null,
    meta: null,
    guilds: [],
    kind: "commands",
    view: "manage",
    scope: "global",
    guildId: "",
    localMode: "targeting", // or "addable": guild files that do not target the guild yet
    includeGlobal: false,
    local: [],
    remote: [],
    selectedLocal: new Set(),
    selectedRemote: new Set(),
};

const KIND_LABELS = {commands: "slash command", context_menu: "context menu"};
let builder;
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

function localStatus(cmd) {
    if (state.localMode === "addable") return badge("Not in this guild", "muted");
    if (cmd.command_scope === "global") return cmd.id ? badge("Deployed", "ok", cmd.id) : badge("Not deployed", "muted");
    const targets = Object.keys(cmd.id ?? {});
    const deployed = deployedGuilds(cmd);
    if (state.scope === "guild") {
        return cmd.id?.[state.guildId] ? badge("Deployed", "ok", cmd.id[state.guildId]) : badge("Pending", "warn", "Deploy it to this guild");
    }
    const title = targets.map(id => `${guildName(id)}: ${cmd.id[id] ?? "pending"}`).join("\n");
    if (targets.length === 0) return badge("No guild", "muted", "Add it to a guild from the Guild scope");
    return badge(`${deployed.length}/${targets.length} guilds`, deployed.length === targets.length ? "ok" : "warn", title);
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

function localColumns() {
    return [
        nameColumn, typeColumn, descriptionColumn, permissionsColumn,
        {label: "Status", value: localStatus},
        {label: "File", class: "mono", value: row => row.filename},
        {label: "", value: row => h("button", {type: "button", class: "ghost small", onclick: () => openEditor(row.filename)}, "Edit")},
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
    const local = state.local.map(cmd => ({...cmd, rowKey: cmd.filename}));
    const remote = state.remote.map(cmd => ({...cmd, rowKey: `${cmd.command_scope}:${cmd.key}`}));
    // Global interactions listed in a guild cannot be deleted from it
    const remoteSelectable = row => state.scope !== "guild" || row.command_scope === "guild";

    replace($("#local-table"), table(localColumns(), local, state.selectedLocal, () => true));
    replace($("#remote-table"), table(remoteColumns(), remote, state.selectedRemote, remoteSelectable));
    renderActions();
}

function selectedLocal() {
    return state.local.filter(cmd => state.selectedLocal.has(cmd.filename));
}

function selectedRemote() {
    return state.remote.filter(cmd => state.selectedRemote.has(`${cmd.command_scope}:${cmd.key}`));
}

function button(label, onclick, {disabled = false, tone = ""} = {}) {
    return h("button", {type: "button", class: tone, disabled, onclick}, label);
}

function renderActions() {
    const local = selectedLocal();
    const remote = selectedRemote();
    const toDeploy = local.filter(cmd => !isDeployed(cmd));
    const toUpdate = local.filter(isDeployed);
    const removable = local.filter(cmd => !hasAnyId(cmd));
    const count = list => list.length ? ` (${list.length})` : "";

    const localActions = [];
    if (state.scope === "guild") {
        localActions.push(h("div", {class: "segmented small"},
            ["targeting", "addable"].map(mode => h("button", {
                type: "button",
                class: state.localMode === mode ? "active" : "",
                onclick: () => { state.localMode = mode; refresh(); },
            }, mode === "targeting" ? "Files of this guild" : "Other guild files"))));
    }
    if (state.localMode === "addable" && state.scope === "guild") {
        localActions.push(button(`Add to this guild${count(local)}`, () => deploy(local, true), {disabled: !local.length}));
    } else {
        if (state.scope !== "all") {
            localActions.push(button(`Deploy${count(toDeploy)}`, () => deploy(toDeploy, false), {disabled: !toDeploy.length}));
        }
        localActions.push(button(state.scope === "all" ? `Update in all their guilds${count(toUpdate)}` : `Update${count(toUpdate)}`, () => update(toUpdate), {disabled: !toUpdate.length}));
        localActions.push(button(`Delete file${count(removable)}`, () => deleteFiles(removable), {disabled: !removable.length, tone: "ghost"}));
    }
    localActions.push(button(`New ${KIND_LABELS[state.kind]}`, () => openBuilder(null), {tone: "ghost"}));
    replace($("#local-actions"), localActions);

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
    if (state.scope === "guild" && !state.guildId) {
        state.local = [];
        state.remote = [];
        renderTables();
        return;
    }
    const current = ++loading;
    for (const id of ["#local-table", "#remote-table"]) replace($(id), h("p", {class: "empty"}, "Loading…"));
    $("#local-folder").textContent = state.app?.folders[state.kind] ?? "";

    const listing = state.scope === "guild" && state.localMode === "addable" ? "&listing=addable" : "";
    const available = state.scope === "guild" && state.includeGlobal ? "&available=true" : "";
    const [local, remote] = await Promise.all([
        api("GET", `${state.kind}/local?${scopeQuery()}${listing}`).catch(() => []),
        api("GET", `${state.kind}/remote?${scopeQuery()}${available}`).catch(() => []),
    ]);
    if (current !== loading) return; // A newer refresh is running

    state.local = local;
    state.remote = remote;
    keepExisting(state.selectedLocal, local.map(cmd => cmd.filename));
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

function whereLabel() {
    if (state.scope === "global") return "globally";
    if (state.scope === "guild") return `in the guild "${guildName(state.guildId)}"`;
    return "in every guild they are deployed in";
}

const names = list => list.map(cmd => cmd.name).join(", ");

async function run(action) {
    $$("main button").forEach(element => element.classList.add("busy"));
    try {
        await action();
    } catch {
        // Already in the log
    } finally {
        $$("main button").forEach(element => element.classList.remove("busy"));
        await refresh();
    }
}

async function deploy(commands, add) {
    if (!await confirmDialog(`Deploy ${names(commands)} ${whereLabel()}?`, "Deploy")) return;
    state.selectedLocal.clear();
    await run(() => api("POST", `${state.kind}/deploy`, {...scopeBody(), filenames: commands.map(cmd => cmd.filename), add}));
}

async function update(commands) {
    if (!await confirmDialog(`Update ${names(commands)} ${whereLabel()} from their local files?`, "Update")) return;
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
    state.selectedLocal.clear();
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
const VIEW_TITLES = {manage: "Manage", builder: "Builder"};

function openBuilder(filename) {
    state.view = "builder";
    renderNavigation();
    builder.open(state.kind, filename);
}

// ---- Editor window ----

function openEditor(filename) {
    const dialog = $("#editor");
    $("#editor-title").textContent = `Edit ${filename}`;
    dialog.classList.remove("closing");
    dialog.showModal();
    editor.open(state.kind, filename);
}

// Refused while the changes are unsaved, as in the builder: its bar flashes instead
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

// Opens a view of a type of interaction, unless the builder has unsaved changes
function navigate(kind, view) {
    if ((kind === state.kind && view === state.view) || !canLeaveBuilder()) return;
    if (kind !== state.kind) {
        state.selectedLocal.clear();
        state.selectedRemote.clear();
    }
    state.kind = kind;
    state.view = view;
    renderNavigation();
    if (view === "builder") builder.open(kind, null); else refresh();
}

function renderNavigation() {
    for (const item of $$(".nav-item")) {
        const current = item.dataset.kind === state.kind && item.dataset.view === state.view;
        item.classList.toggle("active", current);
        if (current) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
    }
    $("#page-title").textContent = `${KIND_TITLES[state.kind]} › ${VIEW_TITLES[state.view]}`;
    $$("[data-scope]").forEach(tab => tab.classList.toggle("active", tab.dataset.scope === state.scope));
    $("#manage-view").hidden = state.view !== "manage";
    $("#builder-view").hidden = state.view !== "builder";
    $(".guild-picker").hidden = state.scope !== "guild";
}

// The builder keeps its unsaved changes: leaving it is refused until they are saved or reset
function canLeaveBuilder() {
    return state.view !== "builder" || !builder || builder.canLeave();
}

function bindNavigation() {
    $$(".nav-item").forEach(item => item.addEventListener("click", () => navigate(item.dataset.kind, item.dataset.view)));
    $$("[data-scope]").forEach(tab => tab.addEventListener("click", () => {
        state.scope = tab.dataset.scope;
        state.localMode = "targeting";
        state.selectedLocal.clear();
        state.selectedRemote.clear();
        renderNavigation();
        refresh();
    }));
    $("#guild-select").addEventListener("change", event => {
        state.guildId = event.target.value;
        state.selectedLocal.clear();
        state.selectedRemote.clear();
        refresh();
    });
    $("#refresh").addEventListener("click", refresh);
    window.addEventListener("beforeunload", event => {
        if ((state.view === "builder" && builder?.isDirty()) || ($("#editor").open && editor?.isDirty())) event.preventDefault();
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

    builder = new Builder($("#builder-view"), {
        meta: state.meta,
        guilds: state.guilds,
        folders: state.app.folders,
        onSaved: () => log("info", "Saved: deploy or update it from the Manage view"),
    });
    editor = new Builder($("#editor-body"), {
        meta: state.meta,
        guilds: state.guilds,
        folders: state.app.folders,
        showNew: false,
        onSaved: filename => {
            log("info", `${filename} saved: update it on Discord to apply the changes`);
            refresh();
        },
    });
    bindEditor();
    await refresh();
}

start();
