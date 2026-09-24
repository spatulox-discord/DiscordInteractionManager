import dotenv from 'dotenv';
import {DiscordRegex} from "./utils/DiscordRegex";
dotenv.config({quiet: true});

export const Env = {
    get token(): string {
        const token = process.env.DISCORD_BOT_TOKEN;
        if (!token) throw new Error('Missing environment variable : DISCORD_BOT_TOKEN');
        return token;
    },
    get dev(): boolean {
        return ["true", "1"].includes(process.env.DISCORD_BOT_DEV?.trim().toLowerCase() ?? "");
    },
    get interactionFolderPath(): string {
        return process.env.DISCORD_INTERACTION_FOLDER ? process.env.DISCORD_INTERACTION_FOLDER : "./handlers";
    },
    get clientId(): string {
        const token = process.env.DISCORD_BOT_CLIENTID;
        if (!token) throw new Error('Missing environment variable : DISCORD_BOT_CLIENTID');

        if(!DiscordRegex.BOT_ID.test(token)){
            throw new Error('Invalid environment variable : DISCORD_BOT_CLIENTID must be a Discord ID')
        }

        return token;
    }
} as const;