import { MenuSelectionCLI } from "../BaseCLI";
import { FolderName } from "../../type/FolderName";
import {
    ChannelType,
    Choice,
    CommandOption,
    DiscordOptionType,
    SlashCommandConfigGenerator
} from "../type/InteractionType";
import {InteractionGeneratorCLI} from "./InteractionGeneratorCLI";

export class SlashCommandGeneratorCLI extends InteractionGeneratorCLI {
    protected getTitle(): string {
        return "📝 Slash Command JSON Generator";
    }

    protected readonly menuSelection: MenuSelectionCLI = [
        { label: "Generate Slash Command", action: () => this },
        { label: "Back", action: () => this.goBack() },
    ];

    protected async execute(): Promise<void> {
        const config: SlashCommandConfigGenerator = {
            command_scope: "global",
            id: "",
            name: "",
            description: "",
            type: 1,
            dm_permission: false
        };

        console.clear();
        console.log("📝 1/8 - Base");
        config.name = await this.requireInput(
            "Name (a-z0-9_-, 1-32 chars): ",
            val => /^[a-z0-9_-]{1,32}$/.test(val)
        );
        config.description = await this.requireInput(
            "Description (1-100 chars): ",
            val => val.length >= 1 && val.length <= 100
        );
        await this.nsfw(config)

        console.clear();
        console.log("🔐 2/8 - Command Permissions");
        await this.addPermissions(config);

        console.clear();
        console.log("💬 3/8 - DM Permissions");
        config.dm_permission = await this.yesNoInput("Authorize DM ? (y/n): ");

        console.clear();
        console.log("💬 4/8 - Context");
        const ctx = await this.context()
        if(ctx.length > 0){
            config.contexts = ctx
        }

        console.clear();
        console.log("💬 5/8 - Integration Type");
        const int_type = await this.integration_context()
        if(int_type.length > 0){
            config.integration_types = int_type
        }

        console.clear();
        console.log("⚙️ 6/8 - Options/Subcommands");
        const result = await this.addOptions();
        if(result.length > 0){
            config.options = result;
        }

        console.clear();
        console.log("⚙️ 7/8 - Guild Specific");
        if(await this.yesNoInput("Guild Specific ? (y/n): ")) {
            const id = await this.optionalGuildIds();
            if(id) {
                config.command_scope = "guild"
                config.id = id
            }
        }

        console.clear();
        console.log("💾 8/8 - Save");
        return await this.save(FolderName.SLASH_COMMANDS, config)
    }

    static allowedOptionTypes(parent: DiscordOptionType | undefined, siblings: CommandOption[]): DiscordOptionType[] {
        const all = Object.values(DiscordOptionType).filter((v): v is DiscordOptionType => typeof v === 'number');
        const isSubcommand = (type: DiscordOptionType) =>
            type === DiscordOptionType.SUB_COMMAND || type === DiscordOptionType.SUB_COMMAND_GROUP;

        if (parent === DiscordOptionType.SUB_COMMAND_GROUP) return [DiscordOptionType.SUB_COMMAND];
        if (parent === DiscordOptionType.SUB_COMMAND) return all.filter(type => !isSubcommand(type));

        const first = siblings[0];
        if (!first) return all;
        return all.filter(type => isSubcommand(type) === isSubcommand(first.type));
    }

    static sortRequiredFirst(options: CommandOption[]): CommandOption[] {
        return [...options].sort((a, b) => Number(!!b.required) - Number(!!a.required));
    }

    private async addOptions(parent?: DiscordOptionType): Promise<CommandOption[]> {
        const options: CommandOption[] = [];

        if (parent === DiscordOptionType.SUB_COMMAND_GROUP) {
            console.log("A subcommand group needs at least one subcommand");
        } else if (!await this.yesNoInput("Add options/subcommands ? (y/n): ")) {
            return options;
        }

        while (true) {
            const allowed = SlashCommandGeneratorCLI.allowedOptionTypes(parent, options);
            console.clear();
            console.log("🚀 Options type :");
            console.log("Valid options : " + allowed.map(type => `${type}.${DiscordOptionType[type]}`).join(', '));

            const type = Number(await this.requireInput(
                `Type (${allowed.join(', ')}): `,
                val => allowed.includes(Number(val))
            )) as DiscordOptionType;

            options.push(await this.buildOption(type, options.map(option => option.name)));

            if (options.length >= 25) {
                console.log("Maximum of 25 options reached");
                break;
            }
            if (!await this.yesNoInput("Other option ? (y/n): ")) break;
        }
        return SlashCommandGeneratorCLI.sortRequiredFirst(options);
    }

    private async buildOption(type: DiscordOptionType, usedNames: string[] = []): Promise<CommandOption> {
        const name = await this.requireInput(
            "Option name (a-z0-9_-, 1-32, unique): ",
            val => /^[a-z0-9_-]{1,32}$/.test(val) && !usedNames.includes(val)
        );
        const description = await this.requireInput(
            "Description (1-100): ",
            val => val.length >= 1 && val.length <= 100
        );

        const option: CommandOption = { type, name, description };

        if (type === DiscordOptionType.SUB_COMMAND || type === DiscordOptionType.SUB_COMMAND_GROUP) {
            option.options = await this.addOptions(type);
            return option;
        }

        option.required = await this.yesNoInput("Required ? (y/n): ");
        await this.handleOptionType(option, type);
        return option;
    }

    private async handleOptionType(option: CommandOption, type: DiscordOptionType): Promise<void> {
        switch (type) {
            case 3: // STRING
                if (await this.yesNoInput("Autocomplete ? ")) option.autocomplete = true;
                option.min_length = await this.optionalNumber("Min length (0-6000): ", {integer: true, min: 0, max: 6000});
                option.max_length = await this.optionalNumber("Max Length (1-6000): ", {integer: true, min: 1, max: 6000});
                if (!option.autocomplete) option.choices = await this.addChoices(type);
                break;

            case 4: case 10: // INTEGER/NUMBER
                option.min_value = await this.optionalNumber("Min value: ", {integer: type === 4});
                option.max_value = await this.optionalNumber("Max value: ", {integer: type === 4});
                option.choices = await this.addChoices(type);
                break;

            case 7: // CHANNEL
                option.channel_types = await this.addChannelTypes();
                break;
        }
    }

    private async optionalNumber(prompt: string, rules: { integer?: boolean, min?: number, max?: number } = {}): Promise<number | undefined> {
        const input = await this.requireInput(prompt, val => {
            if (!val.trim()) return true;
            const num = Number(val);
            return Number.isFinite(num)
                && (!rules.integer || Number.isSafeInteger(num))
                && (rules.min === undefined || num >= rules.min)
                && (rules.max === undefined || num <= rules.max);
        }, true);
        return input.trim() ? Number(input) : undefined;
    }

    static isValidChoiceValue(type: DiscordOptionType, value: string): boolean {
        if (type === DiscordOptionType.STRING) return value.length >= 1 && value.length <= 100;
        if (!value.trim() || !Number.isFinite(Number(value))) return false;
        return type !== DiscordOptionType.INTEGER || Number.isSafeInteger(Number(value));
    }

    private async addChoices(type: DiscordOptionType): Promise<Choice[] | undefined> {
        if (!await this.yesNoInput("Add Choices (25 max) ? ")) return undefined;

        const valueHint = type === DiscordOptionType.STRING ? "≤100 chars" : type === DiscordOptionType.INTEGER ? "integer" : "number";
        const choices: Choice[] = [];
        while (choices.length < 25) {
            const name = await this.requireInput("Choice name (≤100): ", val => val.length <= 100);
            const value = await this.requireInput(`Choice value (${valueHint}): `, val => SlashCommandGeneratorCLI.isValidChoiceValue(type, val));
            choices.push({ name, value: type === DiscordOptionType.STRING ? value : Number(value) });

            if (!await this.yesNoInput("Another choice ? ")) break;
        }
        if(choices.length >= 25){
            console.log("You can't have 25+ choices")
        }
        return choices;
    }

    private async addChannelTypes(): Promise<number[] | undefined> {
        console.log("Types: " +
            Object.entries(ChannelType)
                .filter(([, value]) => typeof value === 'number')
                .map(([name, value]) => `${value}. ${name}`)
                .join(', ')
        );

        const input = await this.requireInput(
            "Types (separated by comma, or leave empty for all): ",
            (val) => {
                if (!val.trim()) return true;

                const trimmed = val.trim().toLowerCase();
                if (trimmed === 'all') return true;

                return val.split(',').every(i => {
                    const num = parseInt(i.trim());
                    return !isNaN(num) && Object.values(ChannelType).includes(num);
                });
            },
            true
        );

        if (!input.trim() || input.trim().toLowerCase() === 'all') return undefined;

        return input.split(',').map(i => parseInt(i.trim()));
    }

}
