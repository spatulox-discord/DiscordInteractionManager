import {Interaction} from "../type/InteractionType";
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

export class InteractionPayload {
    static toDiscord(cmd: Interaction): Record<string, unknown> {
        const source = cmd as unknown as Record<string, unknown>;
        const payload: Record<string, unknown> = {};

        for (const field of DISCORD_FIELDS) {
            if (source[field] !== undefined) {
                payload[field] = source[field];
            }
        }

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
}
