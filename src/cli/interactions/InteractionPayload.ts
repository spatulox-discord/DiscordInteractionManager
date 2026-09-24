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

// PATCH only edits the fields it receives: send their defaults so a field removed locally is also removed on Discord
const PATCH_DEFAULTS = {name_localizations: null, nsfw: false, contexts: null};
const SLASH_PATCH_DEFAULTS = {description_localizations: null, options: []};

export class InteractionPayload {
    static toDiscord(cmd: Interaction): Record<string, unknown> {
        const payload = this.pickDiscordFields(cmd as unknown as Record<string, unknown>);
        payload.default_member_permissions = this.resolvePermissions(cmd);
        return payload;
    }

    static toDiscordPatch(cmd: Interaction): Record<string, unknown> {
        const defaults = cmd.type === CommandType.SLASH ? {...PATCH_DEFAULTS, ...SLASH_PATCH_DEFAULTS} : PATCH_DEFAULTS;
        return {...defaults, ...this.toDiscord(cmd)};
    }

    /**
     * The names list wins over the bitfield, except when it is empty and the bitfield is 0:
     * names cannot express "administrators only", so an empty list must not open the command to everyone.
     * Returns null (everyone) when no permission is set.
     */
    static resolvePermissions(cmd: Interaction): string | null {
        const names = cmd.default_member_permissions_string;
        const bitfield = cmd.default_member_permissions;
        const adminOnly = bitfield !== undefined && bitfield !== null && String(bitfield) === "0";

        if (Array.isArray(names) && (names.length > 0 || !adminOnly)) {
            return Utils.permissionsToBitfield(names) ?? null;
        }
        return bitfield === undefined || bitfield === null ? null : bitfield.toString();
    }

    static fromDiscord(raw: OnlineInteractionConfig): Interaction {
        const scope = raw.guild_id
            ? {command_scope: 'guild', id: {[raw.guild_id]: raw.id}}
            : {command_scope: 'global', id: raw.id};

        // Names would drop the unknown bits, and they win over the bitfield: only keep the bitfield then.
        // No empty list either, which would open the interaction to everyone if the bitfield is edited later
        const permissionNames = Utils.bitfieldToPermissions(raw.default_member_permissions);
        const names = Utils.unknownPermissionBits(raw.default_member_permissions) === 0n && permissionNames.length > 0
            ? {default_member_permissions_string: permissionNames}
            : {};

        return {
            ...this.pickDiscordFields(raw as unknown as Record<string, unknown>),
            ...names,
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
