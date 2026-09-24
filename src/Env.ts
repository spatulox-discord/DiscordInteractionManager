import dotenv from 'dotenv';
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
    }
} as const;