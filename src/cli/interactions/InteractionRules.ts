import {
    ChannelType,
    Choice,
    CommandOption,
    CommandType,
    DiscordOptionType,
    Interaction
} from "../type/InteractionType";
import {DiscordRegex} from "../../utils/DiscordRegex";
import {FileManager} from "../../utils/FileManager";
import {InteractionValidator} from "./InteractionValidator";

export type ChoiceLimits = Pick<CommandOption, "min_length" | "max_length" | "min_value" | "max_value">;

export const MAX_OPTIONS = 25;
export const MAX_CHOICES = 25;
export const MAX_STRING_LENGTH = 6000;

const {SUB_COMMAND, SUB_COMMAND_GROUP, STRING, INTEGER, NUMBER, CHANNEL} = DiscordOptionType;

/**
 * The rules Discord applies to an interaction, shared by the generators of the CLI and the web UI.
 */
export class InteractionRules {

    // Slash commands and options: lowercase, no space
    static isValidName(name: string): boolean {
        return DiscordRegex.COMMAND_NAME.test(name) && name === name.toLowerCase();
    }

    // Discord trims the texts and rejects the blank ones
    static isValidText(text: string, max: number): boolean {
        const trimmed = text.trim();
        return trimmed.length >= 1 && trimmed.length <= max;
    }

    static isSubcommand(type: DiscordOptionType): boolean {
        return type === SUB_COMMAND || type === SUB_COMMAND_GROUP;
    }

    static allowedOptionTypes(parent: DiscordOptionType | undefined, siblings: CommandOption[]): DiscordOptionType[] {
        const all = Object.values(DiscordOptionType).filter((v): v is DiscordOptionType => typeof v === 'number');

        if (parent === SUB_COMMAND_GROUP) return [SUB_COMMAND];
        if (parent === SUB_COMMAND) return all.filter(type => !this.isSubcommand(type));

        const first = siblings[0];
        if (!first) return all;
        return all.filter(type => this.isSubcommand(type) === this.isSubcommand(first.type));
    }

    static sortRequiredFirst(options: CommandOption[]): CommandOption[] {
        return [...options].sort((a, b) => Number(!!b.required) - Number(!!a.required));
    }

    // A choice outside the limits of its option could never be sent
    static isValidChoiceValue(type: DiscordOptionType, value: string, limits: ChoiceLimits = {}): boolean {
        if (type === STRING) {
            const [min, max] = this.choiceLengthRange(limits);
            return value.length >= min && value.length <= max;
        }
        const num = Number(value);
        if (!value.trim() || !Number.isFinite(num)) return false;
        if (type === INTEGER && !Number.isSafeInteger(num)) return false;
        return (limits.min_value === undefined || num >= limits.min_value)
            && (limits.max_value === undefined || num <= limits.max_value);
    }

    static choiceLengthRange(limits: ChoiceLimits): [number, number] {
        return [Math.max(1, limits.min_length ?? 1), Math.min(100, limits.max_length ?? 100)];
    }

    /**
     * @returns why the name cannot be used for an interaction file, or null when it can
     */
    static filenameError(filename: string): string | null {
        const name = filename.trim().replace(/\.json$/i, '');
        if (!FileManager.isSafeFilename(name)) return "Invalid file name";
        if (FileManager.isExampleFile(name)) return 'Files whose name starts with "example" are ignored, choose another name';
        return null;
    }

    /**
     * Checks a whole interaction as the generators would have built it.
     * @returns the errors, each starting with the path of its field (e.g. "options[1].choices[0].value"), empty when valid
     */
    static validateForSave(data: unknown): string[] {
        let cmd: Interaction;
        try {
            cmd = InteractionValidator.validate(data);
        } catch (error) {
            return [(error as Error).message];
        }

        const errors: string[] = [];
        if (cmd.type === CommandType.SLASH) {
            if (!this.isValidName(cmd.name)) errors.push("name: lowercase letters, digits, - _ ', 1-32 characters");
            if (!this.isValidText(cmd.description, 100)) errors.push("description: 1-100 characters");
            if (cmd.options) this.validateOptions(cmd.options, undefined, "options", errors);
        } else if (!this.isValidText(cmd.name, 32)) {
            errors.push("name: 1-32 characters");
        }
        return errors;
    }

    private static validateOptions(options: CommandOption[], parent: DiscordOptionType | undefined, path: string, errors: string[]): void {
        if (options.length > MAX_OPTIONS) errors.push(`${path}: ${MAX_OPTIONS} options at most`);
        if (parent === SUB_COMMAND_GROUP && options.length === 0) errors.push(`${path}: a subcommand group needs at least one subcommand`);

        const names = new Set<string>();
        let optionalSeen = false;
        options.forEach((option, index) => {
            const at = `${path}[${index}]`;
            if (!this.allowedOptionTypes(parent, options.slice(0, index)).includes(option.type)) {
                errors.push(`${at}.type: ${DiscordOptionType[option.type]} is not allowed here`);
            }
            if (!this.isValidName(option.name)) errors.push(`${at}.name: lowercase letters, digits, - _ ', 1-32 characters`);
            else if (names.has(option.name)) errors.push(`${at}.name: "${option.name}" is already used`);
            names.add(option.name);
            if (!this.isValidText(option.description, 100)) errors.push(`${at}.description: 1-100 characters`);

            if (this.isSubcommand(option.type)) {
                this.validateOptions(option.options ?? [], option.type, `${at}.options`, errors);
                return;
            }
            if (option.options !== undefined) errors.push(`${at}.options: only subcommands have options`);
            if (option.required) {
                if (optionalSeen) errors.push(`${at}.required: required options must come before the optional ones`);
            } else {
                optionalSeen = true;
            }
            this.validateOptionFields(option, at, errors);
        });
    }

    private static validateOptionFields(option: CommandOption, at: string, errors: string[]): void {
        const {type} = option;
        const isText = type === STRING;
        const isNumeric = type === INTEGER || type === NUMBER;

        const lengths = [option.min_length, option.max_length];
        if (lengths.some(value => value !== undefined)) {
            if (!isText) errors.push(`${at}: only STRING options have a length`);
            else if (lengths.some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > MAX_STRING_LENGTH))) {
                errors.push(`${at}: lengths are integers between 0 and ${MAX_STRING_LENGTH}`);
            } else if (option.max_length !== undefined && option.max_length < Math.max(1, option.min_length ?? 0)) {
                errors.push(`${at}.max_length: at least 1 and at least min_length`);
            }
        }

        const values = [option.min_value, option.max_value];
        if (values.some(value => value !== undefined)) {
            if (!isNumeric) errors.push(`${at}: only INTEGER and NUMBER options have a min / max value`);
            else if (values.some(value => value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || (type === INTEGER && !Number.isSafeInteger(value))))) {
                errors.push(`${at}: min / max values must be ${type === INTEGER ? "integers" : "numbers"}`);
            } else if (option.min_value !== undefined && option.max_value !== undefined && option.max_value < option.min_value) {
                errors.push(`${at}.max_value: at least min_value`);
            }
        }

        if (option.autocomplete !== undefined && !isText && !isNumeric) errors.push(`${at}.autocomplete: only STRING, INTEGER and NUMBER options`);

        if (option.channel_types !== undefined) {
            const channelTypes = Object.values(ChannelType).filter(value => typeof value === 'number');
            if (type !== CHANNEL) errors.push(`${at}.channel_types: only CHANNEL options`);
            else if (!Array.isArray(option.channel_types) || option.channel_types.some(value => !channelTypes.includes(value))) {
                errors.push(`${at}.channel_types: list of ${channelTypes.join(', ')}`);
            }
        }

        if (option.choices !== undefined) {
            if (!isText && !isNumeric) errors.push(`${at}.choices: only STRING, INTEGER and NUMBER options`);
            else if (option.autocomplete) errors.push(`${at}.choices: not allowed with autocomplete`);
            else this.validateChoices(option.choices, option, `${at}.choices`, errors);
        }
    }

    private static validateChoices(choices: Choice[], option: CommandOption, path: string, errors: string[]): void {
        if (!Array.isArray(choices)) {
            errors.push(`${path}: expected a list`);
            return;
        }
        if (choices.length > MAX_CHOICES) errors.push(`${path}: ${MAX_CHOICES} choices at most`);

        const names = new Set<string>();
        const values = new Set<string>();
        choices.forEach((choice, index) => {
            const at = `${path}[${index}]`;
            if (typeof choice?.name !== 'string' || !this.isValidText(choice.name, 100)) errors.push(`${at}.name: 1-100 characters`);
            else if (names.has(choice.name)) errors.push(`${at}.name: "${choice.name}" is already used`);
            names.add(choice?.name);

            const value = choice?.value;
            const expected = option.type === STRING ? 'string' : 'number';
            if (typeof value !== expected || !this.isValidChoiceValue(option.type, String(value), option)) {
                errors.push(`${at}.value: ${this.choiceValueHint(option.type, option)}`);
            } else if (values.has(String(value))) {
                errors.push(`${at}.value: ${JSON.stringify(value)} is already used`);
            }
            values.add(String(value));
        });
    }

    static choiceValueHint(type: DiscordOptionType, limits: ChoiceLimits): string {
        if (type === STRING) return `${this.choiceLengthRange(limits).join("-")} chars`;
        const range = [
            limits.min_value !== undefined ? `≥ ${limits.min_value}` : "",
            limits.max_value !== undefined ? `≤ ${limits.max_value}` : "",
        ].filter(Boolean).join(", ");
        return (type === INTEGER ? "integer" : "number") + (range ? `, ${range}` : "");
    }
}
