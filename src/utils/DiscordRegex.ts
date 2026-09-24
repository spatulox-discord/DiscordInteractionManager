export class DiscordRegex {
    static readonly SNOWFLAKE = /^[0-9]{17,20}$/;
    static readonly GUILD_ID = DiscordRegex.SNOWFLAKE;
}
