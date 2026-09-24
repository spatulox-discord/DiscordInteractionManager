export class DiscordRegex {
    static readonly SNOWFLAKE = /^[0-9]{17,20}$/;
    static readonly GUILD_ID = DiscordRegex.SNOWFLAKE;
    // Slash command and option names, which must also be lowercase
    static readonly COMMAND_NAME = /^[-_'\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;
}
