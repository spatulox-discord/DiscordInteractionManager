import {
    ChannelType,
    CommandOption,
    CommandType,
    DiscordOptionType,
    Interaction,
    InteractionContextType,
    InteractionIntegrationType
} from "../type/InteractionType";
import {Utils} from "../utils/Utils";
import {InteractionPayload} from "./InteractionPayload";

/**
 * Formats every detail of an interaction (local file or fetched from Discord) as printable lines.
 */
export class InteractionDetails {
    static format(cmd: Interaction): string[] {
        const title = cmd.type === CommandType.SLASH ? `/${cmd.name} — ${cmd.description}` : cmd.name;
        const lines = [
            `${title}   (${this.typeLabel(cmd.type)}, ${this.scopeLabel(cmd)})`,
            `Permissions  : ${this.permissionsLabel(cmd) || "Everyone"}`,
            `Contexts     : ${this.enumNames(cmd.contexts, InteractionContextType)}`,
            `Integration  : ${this.enumNames(cmd.integration_types, InteractionIntegrationType)}`,
            `NSFW         : ${cmd.nsfw ? "yes" : "no"}`,
        ];

        const localizations = this.localizations(cmd);
        if (localizations) lines.push(`Localizations: ${localizations}`);
        if (cmd.filename) lines.push(`File         : ${cmd.filename}`);

        if (cmd.type === CommandType.SLASH) {
            const options = cmd.options ?? [];
            lines.push(options.length > 0 ? "Options:" : "Options      : none");
            lines.push(...this.formatOptions(options, "  "));
        }
        return lines;
    }

    static typeLabel(type: CommandType): string {
        if (type === CommandType.SLASH) return "Slash";
        return type === CommandType.USER_CONTEXT_MENU ? "User Context Menu" : "Message Context Menu";
    }

    // Empty when everyone can use the interaction
    static permissionsLabel(cmd: Interaction): string {
        const permissions = InteractionPayload.resolvePermissions(cmd);
        if (permissions === "0") return "Administrators only";

        const names = Utils.bitfieldToPermissions(permissions);
        const unknown = Utils.unknownPermissionBits(permissions);
        return (unknown ? [...names, `Unknown (${unknown})`] : names).join(", ");
    }

    private static scopeLabel(cmd: Interaction): string {
        if (cmd.command_scope === "global") return `global, ID ${cmd.id ?? "not deployed"}`;
        const ids = Object.entries(cmd.id).map(([guildId, id]) => `${guildId} → ${id ?? "not deployed"}`);
        return `guild, ${ids.join(", ") || "no guild"}`;
    }

    private static enumNames(values: number[] | undefined, enumObject: Record<number, string>): string {
        if (!values?.length) return "Discord default";
        return values.map(value => enumObject[value] ?? String(value)).join(", ");
    }

    // "fr (name, description), de (name)"
    private static localizations(cmd: Interaction): string {
        const raw = cmd as unknown as Record<string, Record<string, string> | null | undefined>;
        const fieldsByLocale = new Map<string, string[]>();
        for (const field of ["name", "description"]) {
            for (const locale of Object.keys(raw[`${field}_localizations`] ?? {})) {
                fieldsByLocale.set(locale, [...(fieldsByLocale.get(locale) ?? []), field]);
            }
        }
        return [...fieldsByLocale].map(([locale, fields]) => `${locale} (${fields.join(", ")})`).join(", ");
    }

    private static formatOptions(options: CommandOption[], indent: string): string[] {
        const lines: string[] = [];
        options.forEach((option, index) => {
            const last = index === options.length - 1;
            lines.push(`${indent}${last ? "└─" : "├─"} ${option.name} (${this.optionTraits(option).join(", ")}) — ${option.description}`);

            const childIndent = indent + (last ? "   " : "│  ");
            if (option.choices?.length) {
                lines.push(`${childIndent}choices: ${option.choices.map(choice => `${choice.name} = ${JSON.stringify(choice.value)}`).join(", ")}`);
            }
            if (option.options?.length) {
                lines.push(...this.formatOptions(option.options, childIndent));
            }
        });
        return lines;
    }

    private static optionTraits(option: CommandOption): string[] {
        const traits = [DiscordOptionType[option.type] ?? String(option.type)];
        if (option.required) traits.push("required");
        if (option.min_length !== undefined || option.max_length !== undefined) {
            traits.push(`length ${option.min_length ?? 0}-${option.max_length ?? 6000}`);
        }
        if (option.min_value !== undefined) traits.push(`min ${option.min_value}`);
        if (option.max_value !== undefined) traits.push(`max ${option.max_value}`);
        if (option.autocomplete) traits.push("autocomplete");
        if (option.channel_types?.length) {
            traits.push(`channels: ${option.channel_types.map(type => ChannelType[type] ?? String(type)).join(" / ")}`);
        }
        return traits;
    }
}
