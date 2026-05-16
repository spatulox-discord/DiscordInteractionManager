#!/usr/bin/env node
import {REST} from '@discordjs/rest';
import {RESTGetCurrentApplicationResult, Routes} from 'discord-api-types/v10';
import {Guild} from "discord.js";
import * as fs from 'fs/promises';
import {Log} from "../../utils/Log";
import {FileManager} from "../../utils/FileManager";
import {PathUtils} from "../../utils/PathUtils";
import {
    BaseInteractionConfig,
    CommandType, ContextMenuCommand, ContextMenuGlobalGuildCommand, ContextMenuSpecificGuildCommand, Interaction,
    OnlineInteractionConfig, SlashCommand, SlashGlobalGuildCommand, SlashSpecificGuildCommand,
    SpecificCommandId
} from "../type/InteractionType";
import {Utils} from "../utils/Utils";
import {Listing} from "../enum/Listing";

export abstract class BaseInteractionManager {
    public abstract folderPath: string;
    public abstract commandType: number[];

    protected clientId: string;
    protected token: string;
    protected rest: REST;

    constructor(clientId: string, token: string) {
        this.clientId = clientId;
        this.token = token;
        this.rest = new REST({ version: '10' }).setToken(token);
    }

    async getBotName(): Promise<string> {
        try {
            const botUser = await this.rest.get(Routes.currentApplication()) as RESTGetCurrentApplicationResult;
            return botUser.name;
        } catch (error) {
            console.error("Cannot fetch bot name:", error);
            return "Unknown Bot";
        }
    }

    async printInteraction(cmdList: Interaction[]): Promise<void> {
        console.table(
            cmdList.map((cmd: Interaction) => ({
                Nom: cmd.name,
                Type: cmd.type === CommandType.SLASH ? 'Slash' :
                    cmd.type === CommandType.USER_CONTEXT_MENU ? 'User Context Menu' : 'Message Context Menu',
                Description: 'description' in cmd ? cmd.description : 'N/A',
                Permissions: Utils.bitfieldToPermissions(cmd.default_member_permissions).join(", "),
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

    async listFromFile(list: Listing, guildID?: string): Promise<Interaction[]> {
        const scopeMessage = guildID ? `(guild ${guildID})` : "(global)";

        console.log(`Listing Local Handlers (${this.folderPath}) ${scopeMessage}`);

        try {
            const files = await FileManager.listJsonFiles(PathUtils.createPathFolder(this.folderPath));
            if (!files || files.length === 0) {
                console.log('No files found');
                return [];
            }

            const commandList: Interaction[] = [];

            for (const [_index, file] of files.entries()) {
                if (file.includes("example")) continue;

                const cmd = await this.readInteraction(PathUtils.createPathFile(this.folderPath, file));
                if (!cmd) continue;
                // === LISTING.DEPLOYED === Liste ceux QUI ONT un ID défini
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

                        cmd.id = Object.keys(newGuildIds).length > 0 ? newGuildIds : {};
                    }

                }

                // === LISTING.LOCAL === Liste ceux SANS ID (ou vide pour guildID)
                if (list === Listing.LOCAL) {
                    if (!cmd.id) {
                        // No ID → OK
                    } else if (cmd.command_scope === "global") {
                        // Global deployed → skip
                        continue;
                    } else if (guildID && cmd.id[guildID]) {
                        // Deployed in this guild → skip
                        continue;
                    } else if (cmd.id && cmd.command_scope === "guild") {
                        //console.log(cmd)
                        // *** FILTRER guild_ids and keep non-deployed ***
                        const allDeployed = Object.values(cmd.id || {}).every(id => id != null);
                        if (allDeployed) continue;

                        // Filtre les non-déployés
                        cmd.id = Object.fromEntries(
                            Object.entries(cmd.id || {}).filter(([_gId, id]) => id == null)
                        );
                    }
                }
                // Filtre scope guild
                if (guildID && cmd.id && !Object.keys(cmd.id)?.includes(guildID)) continue;

                const commandWithIndex = {
                    ...cmd,
                    filename: file
                } as Interaction;

                commandList.push(commandWithIndex);
            }

            console.log(`${commandList.length} local ${this.folderPath}(s) found\n`);
            await this.printInteraction(commandList);
            return commandList;
        } catch (error) {
            Log.error(`${(error as Error).message}`);
            return [];
        }
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
        console.log(`Listing Deployed Handlers ${this.folderPath} on Discord (${scopeLabel})`);

        try {
            const rawCmds = await this.rest.get(endpoint) as any[];
            const commands = rawCmds.filter(cmd => this.commandType.includes(cmd.type));

            const commandList: Interaction[] = commands.map((cmd: OnlineInteractionConfig, _index: number) => ({
                name: cmd.name,
                description: 'description' in cmd ? cmd.description : 'N/A',
                default_member_permissions: cmd.default_member_permissions,
                default_member_permissions_string: Utils.bitfieldToPermissions(cmd.default_member_permissions),
                dm_permission: cmd.dm_permission,
                contexts: cmd.contexts,
                integration_types: cmd.integration_types,
                ...(cmd.guild_id ? {
                    command_scope: scope as "guild",
                    id: {[cmd.guild_id]: cmd.id},
                    type: cmd.type as CommandType
                } : {
                    command_scope: scope as 'global',
                    id: cmd.id,
                    type: cmd.type as CommandType
                })
            }));

            if(printResult) {
                console.log(`${commandList.length} ${this.folderPath}(s) found\n`);
                await this.printInteraction(commandList);
            }

            return commandList;
        } catch (error) {
            const errorMsg = scope === 'global'
                ? `Error: ${(error as Error).message}`
                : `Guild error ${scope}: ${(error as Error).message}`;
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

    async listAllGuilds(guilds: Guild[]): Promise<{ guild: string; globalCommands: Interaction[], guildCommands: Interaction[] }[]> {
        console.log("📡 Getting all guilds...\n");
        console.log(`📋 ${guilds.length} guild(s) found\n`);

        if (!guilds.length) return [];

        const globalCommands = await this.list(false)

        const guildCommandPromises = guilds.map(async (guild: Guild) => {
            try {

                let guildCommands = await this.listGuild(guild.id, false)

                const allCommands = [...guildCommands, ...globalCommands]
                return {
                    guild: `${guild.name} (${guild.id})`,
                    guildId: guild.id,
                    globalCommands: globalCommands,
                    guildCommands: guildCommands,
                    count: allCommands.length
                };
            } catch (error) {
                console.error(`⚠️ Guild ${guild.id}: ${(error as Error).message}`);
                return {
                    guild: `${guild.name} (${guild.id})`,
                    guildId: guild.id,
                    globalCommands: globalCommands,
                    guildCommands: [],
                    count: 0
                };
            }
        });

        const results = await Promise.all(guildCommandPromises);

        const interactionTypeTitle = this.folderPath ? (this.folderPath?.toUpperCase() ) : "INTERACTION"
        const interactionTypeDesc = this.folderPath ? (this.folderPath?.charAt(0).toUpperCase() + this.folderPath?.slice(1) ) : " Interactions"
        console.log(`📊 ${interactionTypeTitle} PER GUILD :`);
        console.table(results.map(r => ({
            "Guild": r.guild,
            ["Global " + interactionTypeDesc]: r.globalCommands.length,
            ["Specific " + interactionTypeDesc]: r.guildCommands.length,
            "Total": r.count
        })));

        return results.filter(r => r.count > 0);
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

    async delete(commands: Interaction[], guild: Guild | null): Promise<void> {
        console.log(`Deleting ${commands.length} ${this.folderPath}(s)...`);

        const IDList: string[] = [];

        for (const cmd of commands) {
            if (!cmd.id) {
                Log.error(`${cmd.name}: No Discord ID, cannot delete the ${this.folderPath}`);
                continue;
            }

            if (cmd.command_scope === "global") {
                IDList.push(cmd.id);
            } else if (cmd.id && cmd.command_scope === "guild") {
                Object.values(cmd.id).forEach(cmdId => {
                    if(cmdId != null)
                    IDList.push(cmdId)
                });
            }

            try {
                let commandId: string | null | undefined;

                if (cmd.command_scope === "global") {
                    commandId = cmd.id;
                } else if (guild && cmd.command_scope == "guild" && cmd.id) {
                    commandId = cmd.id[guild.id];
                    if (!commandId) {
                        console.log(`${cmd.name}: No command ID for guild ${guild.id}`);
                        continue;
                    }
                } else {
                    Log.error(`${cmd.name}: Invalid ID type for delete`);
                    continue;
                }

                if(!commandId){
                    Log.error(`Command Id is undefined (${commandId}) for ${cmd.name}...`);
                    continue
                }
                if (guild) {
                    // Guild command
                    await this.rest.delete(Routes.applicationGuildCommand(this.clientId, guild.id, commandId));
                } else {
                    // Global command
                    await this.rest.delete(Routes.applicationCommand(this.clientId, commandId));
                }

                console.log(`${cmd.name} for ${guild?.name} deleted`);
            } catch (error) {
                Log.error(`${cmd.name}: ${(error as Error).message}`);
            }

        }
        if (IDList.length > 0) {
            await this.removeLocalIdFromFile(IDList);
        }
    }

    async update(commands: Interaction[], guild: Guild | null): Promise<void> {
        console.log(`Updating ${commands.length} ${this.folderPath}(s)...`);

        for (const cmd of commands) {
            if (!cmd.id) {
                Log.error(`${cmd.name}: No Discord ID, cannot update the ${this.folderPath} ${cmd.name}`);
                continue;
            }

            // Lecture du fichier original pour préserver les IDs existants
            let fileCmd: Interaction | null = null;
            if (cmd.filename) {
                const filePath = PathUtils.createPathFile(this.folderPath, cmd.filename);
                fileCmd = await this.readInteraction(filePath);
            }

            if (cmd.default_member_permissions_string) {
                cmd.default_member_permissions = Utils.permissionsToBitfield(cmd.default_member_permissions_string);
            }

            try {
                // Case 1: Specific Guild
                if (guild) {
                    let commandId: string | undefined | null;
                    if (cmd.command_scope === "global") {
                        commandId = cmd.id;
                    } else if (cmd.id && cmd.command_scope === "guild") {
                        commandId = cmd.id[guild.id];
                    }

                    if (!commandId) {
                        Log.error(`${cmd.name}: No command ID for guild ${guild.id}`);
                        continue;
                    }

                    await this.rest.patch(Routes.applicationGuildCommand(this.clientId, guild.id, commandId), {
                        body: cmd
                    });
                    console.log(`${cmd.name} updated in guild ${guild.name} ${guild.id}`);
                }
                // Case 2: Global / All Specific guilds
                else {
                    // 2a: Global command
                    if (cmd.command_scope === "global") {
                        await this.rest.patch(Routes.applicationCommand(this.clientId, cmd.id), {
                            body: cmd
                        });
                        console.log(`${cmd.name} updated globally`);
                    }
                    // 2b: Guild-specific command
                    else if (cmd.id && cmd.command_scope === "guild") {
                        const updatePromises: Promise<any>[] = [];

                        for (const [guildId, commandId] of Object.entries(cmd.id)) {
                            const guildResp = await this.rest.get(Routes.guild(guildId)) as Guild | null;
                            if (!guildResp) {
                                console.error(`Impossible to select guild with ${guildId}`);
                                continue;
                            }
                            if(commandId)
                            updatePromises.push(
                                this.rest.patch(Routes.applicationGuildCommand(this.clientId, guildId, commandId), {
                                    body: cmd
                                }).then(() => {
                                    console.log(`${cmd.name} updated in guild ${guildResp.name} ${guildId}`);
                                })
                            );
                        }

                        await Promise.allSettled(updatePromises);
                    }
                }

                if(cmd.command_scope !== fileCmd?.command_scope) {
                    return
                }
                // Sauvegarde avec préservation des IDs existants
                if (cmd.filename && fileCmd) {
                    // Déterminer le type correct basé sur le scope dominant
                    if(cmd.command_scope == "global" && fileCmd.command_scope == "guild"){
                        console.error("Cannot update the interaction from a guild specific to a global interaction");
                        return
                    }
                    if(cmd.command_scope == "guild" && fileCmd.command_scope == "global"){
                        console.error("Cannot update the interaction from a global to a guild specific interaction");
                        return
                    }
                    const isGlobal = (cmd.command_scope === 'global' || fileCmd.command_scope === 'global');

                    const finalCmd: Interaction = isGlobal
                        ? ({
                            ...fileCmd,
                            ...cmd,
                            command_scope: 'global',
                            id: cmd.id as string
                        })
                        : ({
                            ...fileCmd,
                            ...cmd,
                            command_scope: 'guild' as const,
                            id: { ...(fileCmd.id as SpecificCommandId || {}), ...(cmd.id as SpecificCommandId || {}) }
                        });

                    await this.saveInteraction(cmd.filename, finalCmd);
                } else if (cmd.filename) {
                    await this.saveInteraction(cmd.filename, cmd);
                }

            } catch (error) {
                Log.error(`${cmd.name}: ${(error as Error).message}`);
            }
        }
    }

    private async deploySingleInteraction(cmd: Interaction, file: string): Promise<boolean> {
        const deployToGuilds = cmd.command_scope === "guild" && cmd.id
            ? Object.keys(cmd.id).filter(guildId => cmd.id![guildId] == null)
            : [];
        const dataToSend = { ...cmd };
        delete dataToSend.filename

        if (cmd.default_member_permissions_string && Array.isArray(cmd.default_member_permissions_string)) {
            const bitfield = Utils.permissionsToBitfield(cmd.default_member_permissions_string);
            if (bitfield !== undefined) {
                dataToSend.default_member_permissions = bitfield;
                cmd.default_member_permissions = bitfield;
            } else {
                delete dataToSend.default_member_permissions;
            }
        }

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
                    );
                    newIds[guildId] = (resp as any).id;
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
                const resp = await this.rest.post(Routes.applicationCommands(this.clientId), { body: dataToSend });
                cmd.id = (resp as any).id;
                await this.saveInteraction(file, cmd);
                return true
            } catch (error) {
                console.error(`⚠️  Global: ${(error as Error).message}`);
            }
        }
        return false
    }

    /*private async readInteraction(filePath: string): Promise<Interaction | null> {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data) as Interaction;
        } catch {
            return null;
        }
    }*/

    private async readInteraction(filePath: string): Promise<Interaction | null> {
        try {
            const data = await FileManager.readJsonFile(filePath);

            const validated = this.validateInteraction(data);
            if (!validated) {
                console.error(`Invalid interaction file: ${filePath}`);
                return null;
            }

            return validated;
        } catch (error) {
            console.error(`Error reading ${filePath}:`, error);
            return null;
        }
    }

    private async saveInteraction(fileName: string, cmd: Interaction): Promise<void> {
        delete cmd.filename
        const filePath = PathUtils.createPathFile(this.folderPath, fileName);
        await fs.writeFile(filePath, JSON.stringify(cmd, null, 2));
    }

    private async removeLocalIdFromFile(idListToDelete: string[]): Promise<void> {

        const files = await FileManager.listJsonFiles(PathUtils.createPathFolder(this.folderPath));
        if (!files || files.length === 0) {
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
                await this.saveInteraction(file, localCmd);
            }
        }

    }


    private validateInteraction(data: any): Interaction | null {
        if (!data || typeof data !== 'object' || !data.name || typeof data.name !== 'string') {
            throw new Error(`Expected object with 'name' string, got ${typeof data}`);
        }

        if (data.type === CommandType.SLASH) {
            const result = this.validateSlashCommand(data);
            if (!result) {
                throw new Error(`Expected SlashCommand, got invalid data: ${JSON.stringify(data)}`);
            }
            return result;
        }

        if (data.type === CommandType.USER_CONTEXT_MENU || data.type === CommandType.MESSAGE_CONTEXT_MENU) {
            const result = this.validateContextMenuCommand(data);
            if (!result) {
                throw new Error(`Expected ContextMenuCommand, got invalid data: ${JSON.stringify(data)}`);
            }
            return result;
        }

        throw new Error(`Expected SlashCommand (1) or ContextMenuCommand (2|3), got type ${data.type}`);
    }

    private validateSlashCommand(data: any): SlashCommand | null {
        const base = this.validateBaseInteraction(data);
        if (!base) return null;

        const description = data.description;
        if (typeof description !== 'string') {
            throw new Error(`Expected SlashCommand 'description' string, got ${typeof description}`);
        }

        // Vérifier scope
        if (data.command_scope === 'guild') {
            if (!data.id || typeof data.id !== 'object' || Array.isArray(data.id)) {
                throw new Error(`Expected SlashCommand guild 'id' Record<string, string|null>, got ${typeof data.id}`);
            }
            return {
                ...base,
                type: CommandType.SLASH,
                description,
                options: data.options || [],
                command_scope: 'guild',
                id: data.id
            } as SlashSpecificGuildCommand;
        } else if (data.command_scope === 'global') {
            if (typeof data.id !== 'string' && data.id !== undefined) {
                throw new Error(`Expected SlashCommand global 'id' string|undefined, got ${typeof data.id}`);
            }
            return {
                ...base,
                type: CommandType.SLASH,
                description,
                options: data.options || [],
                command_scope: 'global',
                id: data.id
            } as SlashGlobalGuildCommand;
        } else {
            throw new Error(`Expected SlashCommand 'command_scope' 'guild'|'global', got ${data.command_scope}`);
        }
    }

    private validateContextMenuCommand(data: any): ContextMenuCommand | null {
        const base = this.validateBaseInteraction(data);
        if (!base) return null;

        // Vérifier scope
        if (data.command_scope === 'guild') {
            if (!data.id || typeof data.id !== 'object' || Array.isArray(data.id)) {
                throw new Error(`Expected ContextMenu guild 'id' Record<string, string|null>, got ${typeof data.id}`);
            }
            return {
                ...base,
                type: data.type! as CommandType.USER_CONTEXT_MENU | CommandType.MESSAGE_CONTEXT_MENU,
                command_scope: 'guild',
                id: data.id
            } as ContextMenuSpecificGuildCommand;
        } else if (data.command_scope === 'global') {
            if (typeof data.id !== 'string' && data.id !== undefined) {
                throw new Error(`Expected ContextMenu global 'id' string|undefined, got ${typeof data.id}`);
            }
            return {
                ...base,
                type: data.type! as CommandType.USER_CONTEXT_MENU | CommandType.MESSAGE_CONTEXT_MENU,
                command_scope: 'global',
                id: data.id
            } as ContextMenuGlobalGuildCommand;
        } else {
            throw new Error(`Expected ContextMenu 'command_scope' 'guild'|'global', got ${data.command_scope}`);
        }
    }

    private validateBaseInteraction(data: any): Omit<BaseInteractionConfig, 'type'> | null {
        try {
            return {
                name: data.name,
                default_member_permissions: data.default_member_permissions,
                default_member_permissions_string: data.default_member_permissions_string,
                dm_permission: Boolean(data.dm_permission),
                integration_types: data.integration_types,
                contexts: data.contexts,
                nsfw: data.nsfw,
                filename: data.filename
            };
        } catch {
            throw new Error(`Expected valid BaseInteractionConfig, got invalid base data`);
        }
    }
}