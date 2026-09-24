import { MenuSelectionCLI } from "../BaseCLI";
import { FolderName } from "../../type/FolderName";
import {
    ChannelType,
    Choice,
    CommandOption,
    DiscordOptionType,
    InteractionContextType,
    InteractionIntegrationType,
    SlashCommandConfigGenerator
} from "../type/InteractionType";
import {InteractionGeneratorCLI} from "./InteractionGeneratorCLI";
import {Utils} from "../utils/Utils";
import {DiscordRegex} from "../../utils/DiscordRegex";

type ChoiceLimits = Pick<CommandOption, "min_length" | "max_length" | "min_value" | "max_value">;

export class SlashCommandGeneratorCLI extends InteractionGeneratorCLI {
    protected getTitle(): string {
        return "📝 Slash Command JSON Generator";
    }

    protected readonly menuSelection: MenuSelectionCLI = [
        { label: "Generate Slash Command", action: () => this.generate() },
        { label: "Back", action: () => this.goBack() },
    ];

    protected async generate(): Promise<void> {
        const config: SlashCommandConfigGenerator = {
            command_scope: "global",
            name: "",
            description: "",
            type: 1,
        };

        console.clear();
        console.log("📝 1/7 - Base");
        config.name = await this.input.requireInput(
            "Name (lowercase letters, digits, - _ ', 1-32 chars): ",
            SlashCommandGeneratorCLI.isValidName
        );
        config.description = await this.requireText("Description (1-100 chars): ", 100);
        await this.nsfw(config)

        console.clear();
        console.log("🔐 2/7 - Command Permissions");
        await this.addPermissions(config);

        console.clear();
        console.log("💬 3/7 - Context");
        const ctx = await this.selectEnumValues<InteractionContextType>("Contexts", InteractionContextType)
        if(ctx.length > 0){
            config.contexts = ctx
        }

        console.clear();
        console.log("💬 4/7 - Integration Type");
        const int_type = await this.selectEnumValues<InteractionIntegrationType>("Integration types", InteractionIntegrationType)
        if(int_type.length > 0){
            config.integration_types = int_type
        }

        console.clear();
        console.log("⚙️ 5/7 - Options/Subcommands");
        const result = await this.addOptions();
        if(result.length > 0){
            config.options = result;
        }

        console.clear();
        console.log("⚙️ 6/7 - Guild Specific");
        if(await this.input.yesNoInput("Guild specific?")) {
            config.command_scope = "guild"
            config.id = await this.chooseGuilds()
        }

        console.clear();
        console.log("💾 7/7 - Save");
        return await this.save(FolderName.SLASH_COMMANDS, config)
    }

    static isValidName(name: string): boolean {
        return DiscordRegex.COMMAND_NAME.test(name) && name === name.toLowerCase();
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
        } else if (!await this.input.yesNoInput("Add options/subcommands?")) {
            return options;
        }

        while (true) {
            const allowed = SlashCommandGeneratorCLI.allowedOptionTypes(parent, options);
            console.clear();
            console.log("🚀 Options type :");
            console.log("Valid options : " + allowed.map(type => `${type}.${DiscordOptionType[type]}`).join(', '));

            const type = Number(await this.input.requireInput(
                `Type (${allowed.join(', ')}): `,
                val => allowed.includes(Number(val))
            )) as DiscordOptionType;

            options.push(await this.buildOption(type, options.map(option => option.name)));

            if (options.length >= 25) {
                console.log("Maximum of 25 options reached");
                break;
            }
            if (!await this.input.yesNoInput("Another option?")) break;
        }
        return SlashCommandGeneratorCLI.sortRequiredFirst(options);
    }

    private async buildOption(type: DiscordOptionType, usedNames: string[] = []): Promise<CommandOption> {
        const name = await this.input.requireInput(
            "Option name (lowercase letters, digits, - _ ', 1-32, unique): ",
            val => SlashCommandGeneratorCLI.isValidName(val) && !usedNames.includes(val)
        );
        const description = await this.requireText("Description (1-100): ", 100);

        const option: CommandOption = { type, name, description };

        if (type === DiscordOptionType.SUB_COMMAND || type === DiscordOptionType.SUB_COMMAND_GROUP) {
            option.options = await this.addOptions(type);
            return option;
        }

        option.required = await this.input.yesNoInput("Required?");
        await this.handleOptionType(option, type);
        return option;
    }

    private async handleOptionType(option: CommandOption, type: DiscordOptionType): Promise<void> {
        switch (type) {
            case DiscordOptionType.STRING:
                if (await this.input.yesNoInput("Autocomplete?")) option.autocomplete = true;
                option.min_length = await this.optionalNumber("Min length (0-6000): ", {integer: true, min: 0, max: 6000});
                const minMaxLength = Math.max(1, option.min_length ?? 0);
                option.max_length = await this.optionalNumber(`Max Length (${minMaxLength}-6000): `, {integer: true, min: minMaxLength, max: 6000});
                if (!option.autocomplete) option.choices = await this.addChoices(type, option);
                break;

            case DiscordOptionType.INTEGER: case DiscordOptionType.NUMBER:
                if (await this.input.yesNoInput("Autocomplete?")) option.autocomplete = true;
                option.min_value = await this.optionalNumber("Min value: ", {integer: type === DiscordOptionType.INTEGER});
                option.max_value = await this.optionalNumber(
                    option.min_value === undefined ? "Max value: " : `Max value (≥ ${option.min_value}): `,
                    {integer: type === DiscordOptionType.INTEGER, min: option.min_value}
                );
                if (!option.autocomplete) option.choices = await this.addChoices(type, option);
                break;

            case DiscordOptionType.CHANNEL:
                option.channel_types = await this.addChannelTypes();
                break;
        }
    }

    private async optionalNumber(prompt: string, rules: { integer?: boolean, min?: number, max?: number } = {}): Promise<number | undefined> {
        const input = await this.input.requireInput(prompt, val => {
            if (!val.trim()) return true;
            const num = Number(val);
            return Number.isFinite(num)
                && (!rules.integer || Number.isSafeInteger(num))
                && (rules.min === undefined || num >= rules.min)
                && (rules.max === undefined || num <= rules.max);
        }, true);
        return input.trim() ? Number(input) : undefined;
    }

    // A choice outside the limits of its option could never be sent
    static isValidChoiceValue(type: DiscordOptionType, value: string, limits: ChoiceLimits = {}): boolean {
        if (type === DiscordOptionType.STRING) {
            const [min, max] = this.choiceLengthRange(limits);
            return value.length >= min && value.length <= max;
        }
        const num = Number(value);
        if (!value.trim() || !Number.isFinite(num)) return false;
        if (type === DiscordOptionType.INTEGER && !Number.isSafeInteger(num)) return false;
        return (limits.min_value === undefined || num >= limits.min_value)
            && (limits.max_value === undefined || num <= limits.max_value);
    }

    private static choiceLengthRange(limits: ChoiceLimits): [number, number] {
        return [Math.max(1, limits.min_length ?? 1), Math.min(100, limits.max_length ?? 100)];
    }

    private static choiceValueHint(type: DiscordOptionType, limits: ChoiceLimits): string {
        if (type === DiscordOptionType.STRING) return `${this.choiceLengthRange(limits).join("-")} chars`;
        const range = [
            limits.min_value !== undefined ? `≥ ${limits.min_value}` : "",
            limits.max_value !== undefined ? `≤ ${limits.max_value}` : "",
        ].filter(Boolean).join(", ");
        return (type === DiscordOptionType.INTEGER ? "integer" : "number") + (range ? `, ${range}` : "");
    }

    private async addChoices(type: DiscordOptionType, limits: ChoiceLimits = {}): Promise<Choice[] | undefined> {
        if (!await this.input.yesNoInput("Add choices (25 max)?")) return undefined;

        const valueHint = SlashCommandGeneratorCLI.choiceValueHint(type, limits);
        const choices: Choice[] = [];
        while (choices.length < 25) {
            const name = await this.requireText("Choice name (1-100, unique): ", 100, val => !choices.some(choice => choice.name === val));
            const value = await this.input.requireInput(`Choice value (${valueHint}, unique): `, val =>
                SlashCommandGeneratorCLI.isValidChoiceValue(type, val, limits)
                && !choices.some(choice => String(choice.value) === (type === DiscordOptionType.STRING ? val : String(Number(val))))
            );
            choices.push({ name, value: type === DiscordOptionType.STRING ? value : Number(value) });

            if (!await this.input.yesNoInput("Another choice?")) break;
        }
        if(choices.length >= 25){
            console.log("Maximum of 25 choices reached")
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

        const input = await this.input.requireInput(
            "Types (separated by comma, or leave empty for all): ",
            (val) => {
                if (!val.trim()) return true;

                const trimmed = val.trim().toLowerCase();
                if (trimmed === 'all') return true;

                return Utils.parseIndexList(val)?.every(num => Object.values(ChannelType).includes(num)) ?? false;
            },
            true
        );

        if (!input.trim() || input.trim().toLowerCase() === 'all') return undefined;

        return Utils.parseIndexList(input)!;
    }

}
