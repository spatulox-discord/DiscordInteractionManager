import {DiscordAPIError, REST} from '@discordjs/rest';
import {
    RESTAPIPartialCurrentUserGuild,
    RESTGetCurrentApplicationResult,
    RESTPostAPIApplicationCommandsResult,
    RESTPostAPIApplicationGuildCommandsResult,
    Routes
} from 'discord-api-types/v10';
import {Log} from "../../utils/Log";
import {FileManager} from "../../utils/FileManager";
import {PathUtils} from "../../utils/PathUtils";
import {
    Interaction,
    InteractionIntegrationType,
    OnlineInteractionConfig,
    SpecificCommandId
} from "../type/InteractionType";
import {ALL_GUILDS, Listing} from "../enum/Listing";
import {InteractionValidator} from "./InteractionValidator";
import {InteractionPayload} from "./InteractionPayload";
import {InteractionDetails} from "./InteractionDetails";

export abstract class BaseInteractionManager {
    public abstract folderPath: string;
    public abstract commandType: number[];

    protected clientId: string;
    protected rest: REST;

    /**
     * @param integrationTypes the integration types configured for the application, sent when a file has none
     */
    constructor(clientId: string, token: string, private readonly integrationTypes: InteractionIntegrationType[] = [InteractionIntegrationType.GUILD_INSTALL]) {
        this.clientId = clientId;
        this.rest = new REST({ version: '10' }).setToken(token);
    }

    static async fetchApplication(token: string): Promise<RESTGetCurrentApplicationResult> {
        const rest = new REST({ version: '10' }).setToken(token);
        return await rest.get(Routes.currentApplication()) as RESTGetCurrentApplicationResult;
    }

    printInteraction(cmdList: Interaction[]): void {
        console.table(
            cmdList.map((cmd: Interaction) => ({
                Name: cmd.name,
                Type: InteractionDetails.typeLabel(cmd.type),
                Description: 'description' in cmd ? cmd.description : 'N/A',
                Permissions: InteractionDetails.permissionsLabel(cmd),
                ID: (() => {
                    if (!cmd.id) return 'N/A';
                    if (cmd.command_scope === "global") return cmd.id;
                    return Object.entries(cmd.id)
                        .filter(([_guildId, cmdId]) => cmdId !== null)
                        .map(([_guildId, cmdId]) => `${cmdId}` /*`${_guildId}:${cmdId}`*/)
                        .join(', ') || "N/A";
                })(),
                GuildID: (() => {
                    if (!cmd.id) return 'N/A';
                    if (cmd.command_scope === "global") return "Global";
                    return Object.keys(cmd.id)
                        .join(', ');
                })(),
            })));
    }

    /**
     * @param scope nothing for global interactions, a guild ID, or ALL_GUILDS for guild interactions in any guild
     */
    async listFromFile(list: Listing, scope?: string | typeof ALL_GUILDS): Promise<Interaction[]> {
        const guildID = typeof scope === "string" ? scope : undefined;
        const allGuilds = scope === ALL_GUILDS;
        const scopeMessage = guildID ? `(guild ${guildID})` : allGuilds ? "(all guilds)" : "(global)";

        console.log(`Listing Local Handlers (${this.folderPath}) ${scopeMessage}`);

        try {
            const files = await this.listLocalFiles();
            if (files.length === 0) {
                console.log('No files found');
                return [];
            }

            const commandList: Interaction[] = [];

            for (const file of files) {
                const cmd = await this.readInteraction(PathUtils.createPathFile(this.folderPath, file));
                if (!cmd) continue;
                if (!guildID && (cmd.command_scope === "guild") !== allGuilds) continue;
                // === LISTING.DEPLOYED === Only the ones with an ID
                if (list === Listing.DEPLOYED) {
                    if (!cmd.id) {
                        continue
                    } else if (cmd.command_scope === "global") {

                    } else if (guildID && cmd.id[guildID]) {
                        cmd.id = {[guildID]: cmd.id[guildID]}
                    } else if (cmd.id && cmd.command_scope === "guild") {
                        const newGuildIds: Record<string, string> = {};

                        for (const gId of Object.keys(cmd.id || {})) {
                            if (cmd.id![gId]) {
                                newGuildIds[gId] = cmd.id![gId]; // Keep only deployed one
                            }
                        }

                        if (Object.keys(newGuildIds).length === 0) continue; // Not deployed in any guild
                        cmd.id = newGuildIds;
                    }

                }

                // === LISTING.LOCAL === Only the ones without an ID (in the requested guild if any)
                if (list === Listing.LOCAL) {
                    if (!cmd.id) {
                        // No ID → OK
                    } else if (cmd.command_scope === "global") {
                        // Global deployed → skip
                        continue;
                    } else if (guildID && cmd.id[guildID]) {
                        // Deployed in this guild → skip
                        continue;
                    } else if (guildID && guildID in cmd.id) {
                        // Only deploy to the requested guild, the other ones stay pending in the file
                        cmd.id = {[guildID]: null};
                    } else if (cmd.id && cmd.command_scope === "guild") {
                        // Skip it when deployed everywhere
                        const allDeployed = Object.values(cmd.id || {}).every(id => id != null);
                        if (allDeployed) continue;

                        // Only deploy to the guilds it is not deployed in yet
                        cmd.id = Object.fromEntries(
                            Object.entries(cmd.id || {}).filter(([_gId, id]) => id == null)
                        );
                    }
                }
                // === LISTING.ADDABLE === Guild files not deployed in this guild yet
                if (list === Listing.ADDABLE) {
                    if (!guildID || cmd.command_scope !== "guild" || cmd.id[guildID]) continue;
                    cmd.id = {[guildID]: null}; // Deploy only there, the file keeps its other guilds
                }

                if (guildID && (cmd.command_scope !== "guild" || !(guildID in cmd.id))) continue;

                const commandWithIndex = {
                    ...cmd,
                    filename: file
                } as Interaction;

                commandList.push(commandWithIndex);
            }

            console.log(`${commandList.length} local ${this.folderPath}(s) found\n`);
            this.warnDuplicates(commandList);
            this.printInteraction(commandList);
            return commandList;
        } catch (error) {
            Log.error(`${(error as Error).message}`);
            return [];
        }
    }

    /**
     * Discord keeps one interaction per type and name in a scope: deploying a second file overwrites the first one,
     * and both files end up with the same ID.
     */
    private warnDuplicates(commands: Interaction[]): void {
        commands.forEach((cmd, index) => {
            for (const other of commands.slice(index + 1)) {
                if (cmd.type !== other.type || cmd.name !== other.name) continue;

                let where: string;
                if (cmd.command_scope === "global" && other.command_scope === "global") {
                    where = "globally";
                } else if (cmd.command_scope === "guild" && other.command_scope === "guild") {
                    const shared = Object.keys(cmd.id).filter(guildId => guildId in other.id);
                    if (shared.length === 0) continue;
                    where = `in guild ${shared.join(", ")}`;
                } else {
                    continue;
                }
                Log.warn(`${cmd.filename} and ${other.filename} both define the ${InteractionDetails.typeLabel(cmd.type)} "${cmd.name}" ${where}: Discord keeps only one of them`);
            }
        });
    }

    private async fetchCommands(
        endpoint:
            | ReturnType<typeof Routes.applicationCommands>
            | ReturnType<typeof Routes.applicationGuildCommands>,
        scope: 'global' | 'guild',
        guildId?: string,
        printResult: boolean = true,
    ): Promise<Interaction[]> {
        const scopeLabel = scope === 'global' ? 'global' : `guild ${guildId}`;
        if (printResult) console.log(`Listing Deployed Handlers ${this.folderPath} on Discord (${scopeLabel})`);

        try {
            const rawCmds = await this.rest.get(endpoint) as OnlineInteractionConfig[];
            const commandList: Interaction[] = rawCmds
                .filter(cmd => this.commandType.includes(cmd.type))
                .map(cmd => InteractionPayload.fromDiscord(cmd));

            if(printResult) {
                console.log(`${commandList.length} ${this.folderPath}(s) found\n`);
                this.printInteraction(commandList);
            }

            return commandList;
        } catch (error) {
            const errorMsg = scope === 'global'
                ? `Error: ${(error as Error).message}`
                : `Guild error ${guildId}: ${(error as Error).message}`;
            Log.error(errorMsg);
            return [];
        }
    }

    async list(printResult: boolean = true): Promise<Interaction[]> {
        return this.fetchCommands(
            Routes.applicationCommands(this.clientId),
            'global',
            undefined,
            printResult
        );
    }

    async listGuild(guildID: string, printResult: boolean = true): Promise<Interaction[]> {
        return this.fetchCommands(
            Routes.applicationGuildCommands(this.clientId, guildID),
            'guild',
            guildID,
            printResult
        );
    }

    /**
     * Prints, for each guild, how many global and guild interactions are available in it.
     */
    async countPerGuild(guilds: RESTAPIPartialCurrentUserGuild[]): Promise<void> {
        if (!guilds.length) {
            console.log("No guild found");
            return;
        }
        console.log(`📡 Counting the ${this.folderPath} of ${guilds.length} guild(s)...\n`);

        // list logs its own errors and returns an empty list
        const globalCount = (await this.list(false)).length;
        const guildCounts = (await this.fetchEachGuild(guilds)).map(commands => commands.length);

        const label = this.folderPath.charAt(0).toUpperCase() + this.folderPath.slice(1);
        console.log(`📊 ${this.folderPath.toUpperCase()} PER GUILD :`);
        console.table(guilds.map((guild, index) => ({
            "Guild": `${guild.name} (${guild.id})`,
            [`Global ${label}`]: globalCount,
            [`Specific ${label}`]: guildCounts[index],
            "Total": globalCount + guildCounts[index]!,
        })));
    }



    /**
     * Fetches the guild interactions of every guild and merges them by type and name,
     * with their ID in each guild and the matching local file if any.
     */
    async listPerGuild(guilds: RESTAPIPartialCurrentUserGuild[]): Promise<Interaction[]> {
        const perGuild = await this.fetchEachGuild(guilds);

        const merged = new Map<string, Interaction & { command_scope: "guild" }>();
        for (const cmd of perGuild.flat()) {
            if (cmd.command_scope !== "guild") continue;
            const key = `${cmd.type}:${cmd.name}`;
            const existing = merged.get(key);
            if (existing) {
                Object.assign(existing.id, cmd.id);
            } else {
                merged.set(key, {...cmd, id: {...cmd.id}});
            }
        }

        const commands = [...merged.values()];
        for (const {cmd, file} of await this.readGuildFiles()) {
            const remote = commands.find(c => c.type === cmd.type && c.name === cmd.name);
            if (remote) remote.filename = file;
        }
        return commands;
    }

    /**
     * Fetches the guild interactions of each guild, in the order of the guilds.
     * Shows how many guilds are done on a terminal, since it takes a while for a bot in many guilds.
     * listGuild logs its own errors and returns an empty list.
     */
    private async fetchEachGuild(guilds: RESTAPIPartialCurrentUserGuild[]): Promise<Interaction[][]> {
        const progress = process.stdout.isTTY
            ? (done: number) => process.stdout.write(`\r📡 ${done}/${guilds.length} guild(s) fetched`)
            : () => {};
        let done = 0;
        progress(done);

        const perGuild = await Promise.all(guilds.map(async guild => {
            const commands = await this.listGuild(guild.id, false);
            progress(++done);
            return commands;
        }));

        if (process.stdout.isTTY) process.stdout.write("\n\n");
        return perGuild;
    }

    private async readGuildFiles(): Promise<{ cmd: Interaction, file: string }[]> {
        const result: { cmd: Interaction, file: string }[] = [];
        for (const file of await this.listLocalFiles()) {
            const cmd = await this.readInteraction(PathUtils.createPathFile(this.folderPath, file));
            if (cmd?.command_scope === "guild") result.push({cmd, file});
        }
        return result;
    }

    async deploy(commands: Interaction[]): Promise<void> {
        console.log(`Deploying ${commands.length} ${this.folderPath}(s)...`);
        let updatedCount = 0;
        for (const cmd of commands) {
            const filename = cmd.filename;
            if (!filename) {
                Log.error(`${cmd.name}: Not linked to a file (wtf)`);
                continue;
            }

            try {
                if(await this.deploySingleInteraction(cmd, filename)){
                    updatedCount++;
                }
            } catch (error) {
                Log.error(`Error ${filename}: ${(error as Error).message}`);
            }
        }
        console.log(`${updatedCount}/${commands.length} deployed`);
    }

    async delete(commands: Interaction[], guild: RESTAPIPartialCurrentUserGuild | null): Promise<void> {
        console.log(`Deleting ${commands.length} ${this.folderPath}(s)...`);

        const IDList: string[] = [];

        for (const cmd of commands) {
            const targets = this.deleteTargets(cmd, guild);
            if (targets.length === 0) {
                Log.error(`${cmd.name}: No Discord ID${guild ? ` for guild ${guild.id}` : ""}, cannot delete the ${this.folderPath}`);
                continue;
            }

            for (const [guildId, commandId] of targets) {
                try {
                    await this.rest.delete(guildId
                        ? Routes.applicationGuildCommand(this.clientId, guildId, commandId)
                        : Routes.applicationCommand(this.clientId, commandId));
                    IDList.push(commandId);
                    console.log(`${cmd.name} deleted ${guildId ? `in guild ${guild?.name ?? guildId}` : "globally"}`);
                } catch (error) {
                    if (BaseInteractionManager.isGone(error)) {
                        IDList.push(commandId);
                        Log.warn(`${cmd.name}${guildId ? ` (guild ${guildId})` : ""}: already deleted on Discord, its ID is removed from the local file`);
                    } else {
                        Log.error(`${cmd.name}${guildId ? ` (guild ${guildId})` : ""}: ${(error as Error).message}`);
                    }
                }
            }
        }
        if (IDList.length > 0) {
            await this.removeLocalIdFromFile(IDList);
        }
    }

    async update(commands: Interaction[], guild: RESTAPIPartialCurrentUserGuild | null): Promise<void> {
        console.log(`Updating ${commands.length} ${this.folderPath}(s)...`);
        const goneIds: string[] = [];

        for (const cmd of commands) {
            if (!cmd.id) {
                Log.error(`${cmd.name}: No Discord ID, cannot update the ${this.folderPath} ${cmd.name}`);
                continue;
            }

            // Read the file itself, to keep the IDs of the guilds that are not updated
            let fileCmd: Interaction | null = null;
            if (cmd.filename) {
                const filePath = PathUtils.createPathFile(this.folderPath, cmd.filename);
                fileCmd = await this.readInteraction(filePath);
            }

            try {
                const body = InteractionPayload.toDiscordPatch(cmd, this.integrationTypes);
                this.syncPermissions(cmd, body);

                // Case 1: Specific Guild
                if (guild) {
                    // A global command has no ID in a guild: it cannot be updated from here
                    const commandId = cmd.command_scope === "guild" ? cmd.id[guild.id] : undefined;

                    if (!commandId) {
                        Log.error(`${cmd.name}: No command ID for guild ${guild.id}`);
                        continue;
                    }

                    if (!await this.patch(Routes.applicationGuildCommand(this.clientId, guild.id, commandId), body, cmd.name, commandId, goneIds)) continue;
                    console.log(`${cmd.name} updated in guild ${guild.name} ${guild.id}`);
                }
                // Case 2: Global / All Specific guilds
                else {
                    // 2a: Global command
                    if (cmd.command_scope === "global") {
                        if (!await this.patch(Routes.applicationCommand(this.clientId, cmd.id), body, cmd.name, cmd.id, goneIds)) continue;
                        console.log(`${cmd.name} updated globally`);
                    }
                    // 2b: Guild-specific command
                    else if (cmd.id && cmd.command_scope === "guild") {
                        const deployed = Object.entries(cmd.id)
                            .filter((entry): entry is [string, string] => !!entry[1]);
                        const results = await Promise.allSettled(deployed.map(([guildId, commandId]) =>
                            this.rest.patch(Routes.applicationGuildCommand(this.clientId, guildId, commandId), {body})
                        ));

                        results.forEach((result, index) => {
                            const [guildId, commandId] = deployed[index]!;
                            if (result.status === "fulfilled") {
                                console.log(`${cmd.name} updated in guild ${guildId}`);
                            } else if (BaseInteractionManager.isGone(result.reason)) {
                                goneIds.push(commandId);
                                Log.warn(`${cmd.name}: Guild ${guildId}: already deleted on Discord, its ID is removed from the local file`);
                            } else {
                                Log.error(`${cmd.name}: Guild ${guildId}: ${(result.reason as Error).message}`);
                            }
                        });
                    }
                }

                if (!cmd.filename || !fileCmd) {
                    Log.error(`${cmd.name}: Local file not found, the file was not updated`);
                    continue;
                }
                if (cmd.command_scope !== fileCmd.command_scope) {
                    Log.error(`${cmd.name}: The scope differs from the local file, the file was not updated`);
                    continue;
                }

                const finalCmd: Interaction = cmd.command_scope === "global"
                    ? {...fileCmd, ...cmd, command_scope: 'global', id: cmd.id}
                    : {...fileCmd, ...cmd, command_scope: 'guild', id: {...(fileCmd.id as SpecificCommandId), ...cmd.id}};

                await this.saveInteraction(cmd.filename, finalCmd);

            } catch (error) {
                Log.error(`${cmd.name}: ${(error as Error).message}`);
            }
        }
        if (goneIds.length > 0) {
            await this.removeLocalIdFromFile(goneIds);
        }
    }

    /**
     * Discord answers 404 when the interaction, or its guild, no longer exists
     * (deleted from the Developer Portal, by another tool or by the bot itself).
     * Its local ID can then be removed, or the file would stay deployed forever.
     */
    private static isGone(error: unknown): boolean {
        return error instanceof DiscordAPIError && error.status === 404;
    }

    /**
     * @returns false when the interaction no longer exists on Discord: its ID is added to goneIds
     */
    private async patch(route: `/${string}`, body: Record<string, unknown>, name: string, commandId: string, goneIds: string[]): Promise<boolean> {
        try {
            await this.rest.patch(route, {body});
            return true;
        } catch (error) {
            if (!BaseInteractionManager.isGone(error)) throw error;
            goneIds.push(commandId);
            Log.warn(`${name}: already deleted on Discord, its ID is removed from the local file`);
            return false;
        }
    }

    private async deploySingleInteraction(cmd: Interaction, file: string): Promise<boolean> {
        const deployToGuilds = cmd.command_scope === "guild" && cmd.id
            ? Object.keys(cmd.id).filter(guildId => cmd.id![guildId] == null)
            : [];
        const dataToSend = InteractionPayload.toDiscord(cmd);
        this.syncPermissions(cmd, dataToSend);

        // Guild deployment
        if (cmd.command_scope == "guild") {
            let nb = 0;
            let newIds: SpecificCommandId = {};


            const filePath = PathUtils.createPathFile(this.folderPath, file);
            const fileCmd = await this.readInteraction(filePath);
            if (!fileCmd) {
                console.error("Error when reading the file");
                return false;
            }

            if(fileCmd.command_scope !== cmd.command_scope){
                console.error("For some reason, the scope of the command differ from the on read in the file...")
                return false
            }

            if (fileCmd.id && fileCmd.command_scope == "guild") {
                newIds = { ...fileCmd.id };
            }

            for (const guildId of deployToGuilds) {
                try {
                    const resp = await this.rest.post(
                        Routes.applicationGuildCommands(this.clientId, guildId),
                        { body: dataToSend }
                    ) as RESTPostAPIApplicationGuildCommandsResult;
                    newIds[guildId] = resp.id;
                } catch (error) {
                    nb++;
                    console.error(`⚠️ Guild ${guildId}: ${(error as Error).message}`);
                }
            }

            const finalCmd: Interaction = {
                ...fileCmd,           // Base
                ...cmd,               // New Data
                command_scope: "guild",
                id: Object.keys(newIds).length > 0 ? newIds : {}
            };

            await this.saveInteraction(file, finalCmd);
            return nb === 0;
        }
        else if(cmd.command_scope == "global") {
            // Global deployment
            try {
                const resp = await this.rest.post(Routes.applicationCommands(this.clientId), { body: dataToSend }) as RESTPostAPIApplicationCommandsResult;
                cmd.id = resp.id;
                await this.saveInteraction(file, cmd);
                return true
            } catch (error) {
                console.error(`⚠️  Global: ${(error as Error).message}`);
            }
        }
        return false
    }

    // Keep the saved bitfield in line with the permission names that were sent
    private syncPermissions(cmd: Interaction, payload: Record<string, unknown>): void {
        if (!Array.isArray(cmd.default_member_permissions_string)) return;

        const bitfield = cmd.default_member_permissions;
        if (payload.default_member_permissions === null && bitfield !== undefined && bitfield !== null) {
            Log.warn(`${cmd.name}: "default_member_permissions_string" is empty, so everyone can use it and "default_member_permissions" (${bitfield}) is cleared. Remove the empty list to use this bitfield`);
        }
        cmd.default_member_permissions = payload.default_member_permissions as string | null;
    }

    /**
     * [guildId, commandId] pairs to delete, guildId being undefined for a global command.
     * Without a guild, a guild command is deleted from every guild it is deployed in.
     */
    private deleteTargets(cmd: Interaction, guild: RESTAPIPartialCurrentUserGuild | null): [string | undefined, string][] {
        if (cmd.command_scope === "global") return cmd.id && !guild ? [[undefined, cmd.id]] : [];
        const deployed = Object.entries(cmd.id ?? {}).filter((entry): entry is [string, string] => !!entry[1]);
        return guild ? deployed.filter(([guildId]) => guildId === guild.id) : deployed;
    }

    // The JSON files of the folder, without the ignored example files
    private async listLocalFiles(): Promise<string[]> {
        const files = await FileManager.listJsonFiles(PathUtils.createPathFolder(this.folderPath)) || [];
        return files.filter(file => !FileManager.isExampleFile(file));
    }

    private async readInteraction(filePath: string): Promise<Interaction | null> {
        const data = await FileManager.readJsonFile(filePath);
        if (data === false) return null; // readJsonFile already logged why

        let cmd: Interaction;
        try {
            cmd = InteractionValidator.validate(data);
        } catch (error) {
            Log.error(`Invalid interaction file ${filePath}: ${(error as Error).message}`);
            return null;
        }

        // Its manager would never find it on Discord, nor clean its ID once deleted
        if (!this.commandType.includes(cmd.type)) {
            Log.error(`${filePath}: a ${InteractionDetails.typeLabel(cmd.type)} does not belong in the ${this.folderPath} folder`);
            return null;
        }
        return cmd;
    }

    private async saveInteraction(fileName: string, cmd: Interaction): Promise<void> {
        delete cmd.filename
        const filePath = PathUtils.createPathFile(this.folderPath, fileName);
        await FileManager.writeFileAtomic(filePath, JSON.stringify(cmd, null, 2));
    }

    private async removeLocalIdFromFile(idListToDelete: string[]): Promise<void> {

        const files = await this.listLocalFiles();
        if (files.length === 0) {
            console.log('No local files to clean');
            return
        }

        for (const file of files) {
            const filePath = PathUtils.createPathFile(this.folderPath, file);
            const localCmd = await this.readInteraction(filePath);
            if (!localCmd?.id) continue;

            let hasDeletion = false;

            // Case 1: id string global
            if (localCmd.command_scope === "global") {
                if (idListToDelete.includes(localCmd.id)) {
                    delete localCmd.id;
                    hasDeletion = true;
                }
            }
            // Case 2: id Record guild-specific
            else if (localCmd.command_scope === 'guild') {
                const guildIds = Object.keys(localCmd.id);
                for (const guildId of guildIds) {
                    const cmdId = localCmd.id[guildId];
                    if (cmdId && idListToDelete.includes(cmdId)) {
                        localCmd.id[guildId] = null;
                        hasDeletion = true;
                    }
                }
            }

            if (hasDeletion) {
                try {
                    await this.saveInteraction(file, localCmd);
                } catch (error) {
                    Log.error(`${file}: the deleted ID could not be removed from the file: ${(error as Error).message}`);
                }
            }
        }

    }
}
