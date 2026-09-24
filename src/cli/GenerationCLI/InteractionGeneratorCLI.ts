import {BaseCLI, MenuSelectionCLI} from "../BaseCLI";
import {PermissionFlagsBits} from "discord.js";
import {DiscordRegex} from "../../utils/DiscordRegex";
import {
    ContextMenuConfigGenerator,
    InteractionContextType,
    InteractionIntegrationType, SlashCommandConfigGenerator,
    SpecificCommandId
} from "../type/InteractionType";
import {Utils} from "../utils/Utils";

export abstract class InteractionGeneratorCLI extends BaseCLI {
    protected abstract getTitle(): string

    protected abstract readonly menuSelection: MenuSelectionCLI

    protected abstract execute(): Promise<void>;

    protected async nsfw(config: SlashCommandConfigGenerator | ContextMenuConfigGenerator): Promise<void> {
        if(await this.yesNoInput("NSFW ? (y/n)")){
            config.nsfw = true
        }
    }

    protected async addPermissions(config: SlashCommandConfigGenerator | ContextMenuConfigGenerator): Promise<void> {
        console.clear();

        const permEntries = Object.entries(PermissionFlagsBits);
        const numberedPerms = permEntries.map(([name, _value], index) =>
            `${index}. ${name}`
        ).join('\n');

        console.log("Valid Permissions:\n" + numberedPerms);

        const input = await this.requireInput(
            "Permission numbers (comma-separated, 'everyone', or leave empty): ",
            (val) => {
                if (!val.trim() || val.toLowerCase() === 'everyone') return true;

                return val.split(',').every(numStr => {
                    const num = parseInt(numStr.trim());
                    return num >= 0 && num < permEntries.length && !isNaN(num);
                });
            },
            true
        );

        if (!input.trim() || input.toLowerCase() === 'everyone') {
            //config.default_member_permissions_string = [];
            //config.default_member_permissions = 0n;
            return;
        }

        const selectedNums = input.split(',').map(n => parseInt(n.trim()));
        const selectedPermNames: (keyof typeof PermissionFlagsBits)[] = [];

        for (const i of selectedNums) {
            const entry = permEntries[i];
            if (entry) {
                selectedPermNames.push(entry[0] as keyof typeof PermissionFlagsBits);
            }
        }

        config.default_member_permissions_string = selectedPermNames;
        config.default_member_permissions = Utils.permissionsToBitfield(selectedPermNames);
    }


    protected async optionalGuildIds(): Promise<SpecificCommandId | undefined> {
        const isCancel = (val: string) => !val.trim() || val.trim().toLowerCase() === 'none';
        const input = await this.requireInput(
            "Guild IDs (separated by comma, or 'none' to cancel): ",
            val => isCancel(val) || val.split(',').every(id => DiscordRegex.GUILD_ID.test(id.trim())),
            true
        );
        if (isCancel(input)) return undefined;
        return Object.fromEntries(input.split(',').map(id => [id.trim(), null]));
    }

    protected async context(): Promise<InteractionContextType[]> {

        const enumValues = Object.values(InteractionContextType)
            .filter((v): v is InteractionContextType => typeof v === 'number');

        const enumKeys = Object.keys(InteractionContextType).filter(
            key => isNaN(Number(key))
        );
        const contextChoices = enumKeys
            .map((key, index) => `${index}=${key}`)
            .join(', ');

        const input = await this.requireInput(
            `Enter context indices (${contextChoices}) separated by commas: `,
            (val) => {
                if (!val) return false;
                if (val.trim().toLowerCase() === "all") return true;
                const nums = val
                    .split(',')
                    .map(v => parseInt(v.trim(), 10))
                    .filter(v => !isNaN(v));

                if (nums.length === 0) return false;

                return nums.every(n => enumValues.includes(n));
            }
        );

        if (input.trim().toLowerCase() === 'all') {
            return enumValues;
        }

        const numbers = input
            .split(',')
            .map(v => parseInt(v.trim(), 10))
            .filter(v => !isNaN(v) && enumValues.includes(v));

        // Enlever les doublons et convertir en enum
        return Array.from(new Set(numbers)) as InteractionContextType[];
    }

    protected async integration_context(): Promise<InteractionIntegrationType[]> {

        const enumValues = Object.values(InteractionIntegrationType)
            .filter((v): v is InteractionIntegrationType => typeof v === 'number');

        const enumKeys = Object.keys(InteractionIntegrationType).filter(
            key => isNaN(Number(key))
        );
        const contextChoices = enumKeys
            .map((key, index) => `${index}=${key}`)
            .join(', ');

        const input = await this.requireInput(
            `Enter integration context indices (${contextChoices}) separated by commas: `,
            (val) => {
                if (!val) return false;
                if (val.trim().toLowerCase() === "all") return true;
                const nums = val
                    .split(',')
                    .map(v => parseInt(v.trim(), 10))
                    .filter(v => !isNaN(v));

                if (nums.length === 0) return false;

                return nums.every(n => enumValues.includes(n));
            }
        );

        if (input.trim().toLowerCase() === 'all') {
            return enumValues;
        }

        const numbers = input
            .split(',')
            .map(v => parseInt(v.trim(), 10))
            .filter(v => !isNaN(v) && enumValues.includes(v));

        // Enlever les doublons et convertir en enum
        return Array.from(new Set(numbers)) as InteractionIntegrationType[];
    }
}