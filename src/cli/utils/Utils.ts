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

    // Own keys only, so "constructor" or "toString" are not permissions
    static isPermissionName(name: string): boolean {
        return Object.prototype.hasOwnProperty.call(PermissionFlagsBits, name);
    }

    /**
     * @throws on an unknown name, which would otherwise restrict the command to administrators without warning
     */
    static permissionsToBitfield(perms: string[] | undefined): string | undefined {
        if (perms !== undefined && !Array.isArray(perms)) {
            throw new Error("Invalid default_member_permissions_string: not an array");
        }
        if (!perms || perms.length === 0) return undefined;

        let bits = 0n;
        for (const name of perms) {
            if (!this.isPermissionName(name)) {
                throw new Error(`Unknown permission in default_member_permissions_string: ${name}`);
            }
            bits |= (PermissionFlagsBits as Record<string, bigint>)[name]!;
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