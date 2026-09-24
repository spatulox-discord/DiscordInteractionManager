/**
 * Classe utilitaire pour valider tous les formats Discord avec regex
 */
export class DiscordRegex {
    // Caractères spéciaux
    static readonly SPACE = "\u200B";

    // URLs basiques
    static readonly URL_REGEX = /(https?:\/\/[^s]+)/;

    /* DISCORD REGEX */
    static readonly USER_REGEX = /<@\d{18}>/;
    static readonly BOT_REGEX = /<@\d{19}>/;
    static readonly CHANNEL_REGEX = /(<#\d{19}>)|(<id:(browse|customize|guide)>)/;
    static readonly ROLE_REGEX = /<@&\d{19}>/;

    /**
     * Mention a User
     * Mention a Role
     */
    static readonly DISCORD_PING_REGEX = new RegExp(
        `(${this.USER_REGEX.source})|(${this.BOT_REGEX.source})|(${this.ROLE_REGEX.source})`
    );

    /**
     * Mention a User
     * Mention a Role
     * Mention a Channel
     */
    static readonly DISCORD_MENTION_REGEX = new RegExp(
        `(${this.DISCORD_PING_REGEX.source})|(${this.CHANNEL_REGEX.source})`
    );

    // ID Discord (user, channel guild)
    static readonly SNOWFLAKE = /^[0-9]{17,20}$/;
    static readonly USER_ID = DiscordRegex.SNOWFLAKE;
    static readonly CHANNEL_ID = DiscordRegex.SNOWFLAKE;
    static readonly GUILD_ID = DiscordRegex.SNOWFLAKE;
    static readonly BOT_ID = DiscordRegex.SNOWFLAKE;

    // Username Discord (2-32 caractères alphanumériques + _ .)
    static readonly USERNAME = /^[a-zA-Z0-9_]{2,32}$/;

    // Username + discrim (ancien format)
    static readonly USERNAME_DISCRIM = /^[a-zA-Z0-9_]{2,32}#\d{4}$/;

    // Channel mention <#123456789012345678>
    static readonly CHANNEL_MENTION = /^<#([0-9]{18})>$/;

    // User mention <@123456789012345678> ou <@!123456789012345678>
    static readonly USER_MENTION = /^<@!?([0-9]{18})>$/;

    // Role mention <@&123456789012345678>
    static readonly ROLE_MENTION = /^<@&([0-9]{18})>$/;

    // URL Invite Discord
    static readonly INVITE = /^discord(?:app\.com\/invite|gg)\/[a-zA-Z0-9]+$/;

    // Emoji Discord (custom or unicode)
    static readonly EMOJI = /^<a?:[a-zA-Z0-9_]{2,32}:[0-9]{18}>$|^[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u;

    /**
     * Validate Discord ID Discord (18)
     */
    static isDiscordId(id: string): boolean {
        return this.USER_ID.test(id) || this.GUILD_ID.test(id) || this.CHANNEL_ID.test(id);
    }

    /**
     * Validate a bot ID (19)
     */
    static isBotMention(mention: string): boolean {
        return this.BOT_REGEX.test(mention);
    }

    /**
     * Validate a User ping
     */
    static isUserMention(mention: string): boolean {
        return this.USER_REGEX.test(mention);
    }

    /**
     * Validate a Discord username
     */
    static isUsername(username: string): boolean {
        return this.USERNAME.test(username);
    }

    /**
     * Type guard for Discord ID
     */
    static isDiscordIdType(id: string): id is string {
        return this.isDiscordId(id);
    }

    /**
     * Any Discord URL
     */
    static isDiscordUrl(url: string): boolean {
        return this.URL_REGEX.test(url) || this.INVITE.test(url);
    }

    /**
     * Any discord mention
     */
    static isAnyMention(text: string): boolean {
        return this.DISCORD_MENTION_REGEX.test(text);
    }

    /**
     * List all regex
     */
    static listAll(): Record<string, RegExp | string> {
        return {
            SPACE: this.SPACE,
            URL_REGEX: this.URL_REGEX,
            USER_REGEX: this.USER_REGEX,
            BOT_REGEX: this.BOT_REGEX,
            CHANNEL_REGEX: this.CHANNEL_REGEX,
            ROLE_REGEX: this.ROLE_REGEX,
            DISCORD_PING_REGEX: this.DISCORD_PING_REGEX,
            DISCORD_MENTION_REGEX: this.DISCORD_MENTION_REGEX,
            USER_ID: this.USER_ID,
            CHANNEL_ID: this.CHANNEL_ID,
            GUILD_ID: this.GUILD_ID,
            USERNAME: this.USERNAME,
            USERNAME_DISCRIM: this.USERNAME_DISCRIM,
            CHANNEL_MENTION: this.CHANNEL_MENTION,
            USER_MENTION: this.USER_MENTION,
            ROLE_MENTION: this.ROLE_MENTION,
            INVITE: this.INVITE,
            EMOJI: this.EMOJI
        };
    }
}