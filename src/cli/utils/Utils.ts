import {PermissionFlagsBits} from "discord-api-types/v10";

export class Utils {

    /**
     * Parses "1, 3,5" into unique indices.
     * @returns null when any part is not a non-negative integer
     */
    static parseIndexList(input: string): number[] | null {
        const parts = input.split(',').map(part => part.trim());
        if (!parts.every(part => /^\d+$/.test(part))) return null;
        return [...new Set(parts.map(Number))];
    }

    static permissionEntries(): [string, bigint][] {
        const namesByValue = new Map<bigint, string>();
        for (const [name, value] of Object.entries(PermissionFlagsBits)) {
            namesByValue.set(value, name);
        }
        return [...namesByValue].map(([value, name]) => [name, value]);
    }

    static permissionsToBitfield(perms: string[] | undefined): string | undefined {
        if (!perms || perms.length === 0) return undefined;
        if(!Array.isArray(perms)){
            throw new Error("Invalid default_permission_string : not an array");
        }
        let bits = 0n;
        for (const name of perms) {
            const value = (PermissionFlagsBits as Record<string, bigint>)[name];
            if (!value) {
                console.warn(`Unknow permission in default_member_permissions: ${name}`);
                continue;
            }
            bits |= value;
        }

        return bits.toString();
    }

    static bitfieldToPermissions(bitfield: string | number | null | bigint | undefined): string[] {
        if (!bitfield) return [];

        const bits = BigInt(bitfield);
        const result: string[] = [];

        for (const [name, value] of this.permissionEntries()) {
            if ((bits & value) === value) {
                result.push(name);
            }
        }

        return result;
    }

    /**
     * Bits without a permission name, e.g. a permission added by Discord after this version of discord-api-types.
     * @returns 0n when every bit has a name
     */
    static unknownPermissionBits(bitfield: string | number | null | bigint | undefined): bigint {
        if (!bitfield) return 0n;
        const known = this.permissionEntries().reduce((bits, [, value]) => bits | value, 0n);
        return BigInt(bitfield) & ~known;
    }
}