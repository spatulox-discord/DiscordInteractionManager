import {CommandType, Interaction} from "../type/InteractionType";

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

        if (cmd.command_scope === 'guild') {
            if (!cmd.id || typeof cmd.id !== 'object' || Array.isArray(cmd.id)) {
                throw new Error(`Expected guild 'id' Record<string, string|null>, got ${typeof cmd.id}`);
            }
        } else if (cmd.command_scope === 'global') {
            if (cmd.id !== undefined && typeof cmd.id !== 'string') {
                throw new Error(`Expected global 'id' string|undefined, got ${typeof cmd.id}`);
            }
        } else {
            throw new Error(`Expected 'command_scope' 'guild'|'global', got ${cmd.command_scope}`);
        }

        return cmd as unknown as Interaction;
    }
}
