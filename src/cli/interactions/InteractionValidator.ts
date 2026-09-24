import {CommandType, Interaction} from "../type/InteractionType";
import {DiscordRegex} from "../../utils/DiscordRegex";
import {Utils} from "../utils/Utils";

export class InteractionValidator {
    static validate(data: unknown): Interaction {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error(`Expected an interaction object, got ${Array.isArray(data) ? 'array' : typeof data}`);
        }
        const cmd = data as Record<string, unknown>;

        if (!cmd.name || typeof cmd.name !== 'string') {
            throw new Error(`Expected 'name' string, got ${typeof cmd.name}`);
        }

        if (cmd.type === CommandType.SLASH) {
            if (typeof cmd.description !== 'string') {
                throw new Error(`Expected SlashCommand 'description' string, got ${typeof cmd.description}`);
            }
        } else if (cmd.type !== CommandType.USER_CONTEXT_MENU && cmd.type !== CommandType.MESSAGE_CONTEXT_MENU) {
            throw new Error(`Expected SlashCommand (1) or ContextMenuCommand (2|3), got type ${cmd.type}`);
        }

        const permissions = cmd.default_member_permissions_string;
        if (permissions !== undefined && (!Array.isArray(permissions) || permissions.some(name => typeof name !== 'string'))) {
            throw new Error(`Expected 'default_member_permissions_string' string[], got ${JSON.stringify(permissions)}`);
        }
        const unknownPermission = permissions?.find(name => !Utils.isPermissionName(name));
        if (unknownPermission !== undefined) {
            throw new Error(`Unknown permission in 'default_member_permissions_string': ${JSON.stringify(unknownPermission)}`);
        }

        const bitfield = cmd.default_member_permissions;
        if (bitfield !== undefined && bitfield !== null && !this.isBitfield(bitfield)) {
            throw new Error(`Expected 'default_member_permissions' to be a permission bitfield or null, got ${JSON.stringify(bitfield)}`);
        }

        if (cmd.command_scope === 'guild') {
            if (!cmd.id || typeof cmd.id !== 'object' || Array.isArray(cmd.id)) {
                throw new Error(`Expected guild 'id' Record<string, string|null>, got ${typeof cmd.id}`);
            }
            for (const [guildId, commandId] of Object.entries(cmd.id)) {
                if (!DiscordRegex.GUILD_ID.test(guildId)) {
                    throw new Error(`Expected guild IDs as keys of 'id', got ${JSON.stringify(guildId)}`);
                }
                if (commandId !== null && !this.isDiscordId(commandId)) {
                    throw new Error(`Expected the ID in guild ${guildId} to be null or a Discord ID, got ${JSON.stringify(commandId)}`);
                }
            }
        } else if (cmd.command_scope === 'global') {
            // Older generators wrote "id": "" for interactions that are not deployed yet
            if (cmd.id !== undefined && cmd.id !== "" && !this.isDiscordId(cmd.id)) {
                throw new Error(`Expected global 'id' to be a Discord ID or missing, got ${JSON.stringify(cmd.id)}`);
            }
        } else {
            throw new Error(`Expected 'command_scope' 'guild'|'global', got ${cmd.command_scope}`);
        }

        return cmd as unknown as Interaction;
    }

    // A string of digits, or a number for bitfields that fit in one
    private static isBitfield(value: unknown): boolean {
        if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0;
        return typeof value === 'string' && /^\d+$/.test(value);
    }

    private static isDiscordId(value: unknown): boolean {
        return typeof value === 'string' && DiscordRegex.SNOWFLAKE.test(value);
    }
}
