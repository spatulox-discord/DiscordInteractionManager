import {PermissionFlagsBits} from "discord-api-types/v10";

export enum CommandType {
    SLASH = 1,
    USER_CONTEXT_MENU,
    MESSAGE_CONTEXT_MENU,
}

export enum InteractionIntegrationType {
    GUILD_INSTALL = 0,
    USER_INSTALL = 1,
}

export enum InteractionContextType {
    SERVER_CHANNEL,
    BOT_DM,
    GROUP_DM
}

export enum DiscordOptionType {
    SUB_COMMAND = 1,
    SUB_COMMAND_GROUP,
    STRING,
    INTEGER,
    BOOLEAN,
    USER,
    CHANNEL,
    ROLE,
    MENTIONABLE,
    NUMBER,
    ATTACHMENT
}

export enum ChannelType { // DM and GroupDM are missing for a reason
    Text = 0,
    Voice = 2,
    Category = 4,
    Announcement = 5,
    ThreadPublic = 10,
    ThreadPublicAnnouncement = 11,
    ThreadPrivate = 12,
    Forum = 15,
    Media = 16
}

export type PermissionString = keyof typeof PermissionFlagsBits | string;

export interface Choice {
    name: string;
    value: string | number;
}

export interface CommandOption {
    type: DiscordOptionType;
    name: string;
    description: string;
    required?: boolean;
    choices?: Choice[];
    options?: CommandOption[];
    min_length?: number;
    max_length?: number;
    min_value?: number;
    max_value?: number;
    channel_types?: number[];
    autocomplete?: boolean;
}

interface OnlineInteractionConfigBase {
    id: string;
    name: string;
    version: string;
    application_id: string,
    type: number;
    guild_id?: string;
    default_member_permissions?: string | bigint | number | null;
    dm_permission: boolean;
    integration_types?: InteractionIntegrationType[];
    contexts?: InteractionContextType[];
    nsfw?: boolean;
}

export interface OnlineCommandConfig extends OnlineInteractionConfigBase {
    description: string,
    options: CommandOption[],
    type: CommandType.SLASH
}

export interface OnlineContextMenuConfig extends OnlineInteractionConfigBase {
    type: CommandType.USER_CONTEXT_MENU | CommandType.MESSAGE_CONTEXT_MENU
}

export type OnlineInteractionConfig = OnlineCommandConfig | OnlineContextMenuConfig;

export interface BaseInteractionConfig {
    name: string;
    type: CommandType;
    default_member_permissions?: string | bigint | number | null;
    default_member_permissions_string?: PermissionString[];
    dm_permission: boolean;
    integration_types?: InteractionIntegrationType[];
    contexts?: InteractionContextType[];
    nsfw?: boolean;
    filename?: string
}

export type SpecificCommandId = Record<string, string | null>;
export interface SpecificGuildInteraction {
    command_scope: 'guild';
    id: SpecificCommandId;
}
export interface GlobalGuildInteraction {
    command_scope: 'global';
    id?: string;
}

export interface SlashLocalCommand extends BaseInteractionConfig {
    description: string;
    type: CommandType.SLASH;
    options?: CommandOption[];
}

export interface SlashSpecificGuildCommand extends SlashLocalCommand, SpecificGuildInteraction {}
export interface SlashGlobalGuildCommand extends SlashLocalCommand, GlobalGuildInteraction {}
export type SlashCommand = SlashSpecificGuildCommand | SlashGlobalGuildCommand;
export interface SlashCommandConfigGenerator extends Omit<SlashCommand, ""> {}

export interface ContextMenuLocalCommand extends BaseInteractionConfig {
    type: CommandType.USER_CONTEXT_MENU | CommandType.MESSAGE_CONTEXT_MENU;
}

export interface ContextMenuSpecificGuildCommand extends ContextMenuLocalCommand, SpecificGuildInteraction {}
export interface ContextMenuGlobalGuildCommand extends ContextMenuLocalCommand, GlobalGuildInteraction {}
export type ContextMenuCommand = ContextMenuSpecificGuildCommand | ContextMenuGlobalGuildCommand;
export interface ContextMenuConfigGenerator extends Omit<ContextMenuCommand, ""> {}

export type Interaction = SlashCommand | ContextMenuCommand;