import {CommandType, Interaction, OnlineInteractionConfig} from "../type/InteractionType";
import {Utils} from "../utils/Utils";

const DISCORD_FIELDS = [
    'type',
    'name',
    'name_localizations',
    'description',
    'description_localizations',
    'options',
    'default_member_permissions',
    'dm_permission',
    'default_permission',
    'integration_types',
    'contexts',
    'nsfw',
] as const;

const SLASH_ONLY_FIELDS = ['description', 'description_localizations', 'options'] as const;

export class InteractionPayload {
    static toDiscord(cmd: Interaction): Record<string, unknown> {
        const payload = this.pickDiscordFields(cmd as unknown as Record<string, unknown>);

        if (Array.isArray(cmd.default_member_permissions_string)) {
            const bitfield = Utils.permissionsToBitfield(cmd.default_member_permissions_string);
            if (bitfield === undefined) {
                delete payload.default_member_permissions;
            } else {
                payload.default_member_permissions = bitfield;
            }
        }

        if (typeof payload.default_member_permissions === 'number' || typeof payload.default_member_permissions === 'bigint') {
            payload.default_member_permissions = payload.default_member_permissions.toString();
        }

        return payload;
    }

    static fromDiscord(raw: OnlineInteractionConfig): Interaction {
        const scope = raw.guild_id
            ? {command_scope: 'guild', id: {[raw.guild_id]: raw.id}}
            : {command_scope: 'global', id: raw.id};

        return {
            ...this.pickDiscordFields(raw as unknown as Record<string, unknown>),
            default_member_permissions_string: Utils.bitfieldToPermissions(raw.default_member_permissions),
            ...scope,
        } as unknown as Interaction;
    }

    private static pickDiscordFields(source: Record<string, unknown>): Record<string, unknown> {
        const fields: Record<string, unknown> = {};
        for (const field of DISCORD_FIELDS) {
            if (source.type !== CommandType.SLASH && (SLASH_ONLY_FIELDS as readonly string[]).includes(field)) {
                continue;
            }
            if (source[field] !== undefined) {
                fields[field] = source[field];
            }
        }
        return fields;
    }
}
