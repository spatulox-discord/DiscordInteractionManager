import { BaseCLI, MenuSelectionCLI } from "./BaseCLI";
import {REST} from "@discordjs/rest";
import { Routes } from 'discord-api-types/v10';
import {Guild} from "discord.js";

const GUILDS_PAGE_SIZE = 200;

export class GuildListManager extends BaseCLI {
    protected guilds: Guild[] = [];

    protected clientId: string;
    protected token: string;
    protected rest: REST;

    constructor(clientId: string, token: string) {
        super();
        this.clientId = clientId;
        this.token = token;
        this.rest = new REST({ version: '10' }).setToken(token);
    }

    protected getTitle(): string {
        return "Guilds Selection";
    }

    protected readonly menuSelection: MenuSelectionCLI = [
        { label: "List guilds", action: () => this.list() },
        { label: "Choose guild", action: () => this.chooseGuild() },
        { label: "Back", action: () => this.goBack() },
    ];

    protected async execute(): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async list(printResult: boolean = true): Promise<Guild[]> {
        console.clear();
        if(printResult) console.log(`${this.getTitle()}\n`);

        try {

            this.guilds = await this.fetchAllGuilds();

            if(printResult){
                console.table(this.guilds.map((g, _i) => ({
                    "Guild ID": g.id,
                    Nom: g.name
                })));

                console.log(`\n📋 ${this.guilds.length} guild(s) found\n`);
            }

            return this.guilds;
        } catch (error) {
            console.error(`Error when listing guilds: ${error}`);
            return [];
        }
    }

    private async fetchAllGuilds(): Promise<Guild[]> {
        const guilds: Guild[] = [];
        let after: string | undefined;
        while (true) {
            const query = new URLSearchParams({limit: String(GUILDS_PAGE_SIZE)});
            if (after) query.set("after", after);

            const page = await this.rest.get(Routes.userGuilds(), {query}) as Guild[];
            guilds.push(...page);

            const last = page[page.length - 1];
            if (page.length < GUILDS_PAGE_SIZE || !last) return guilds;
            after = last.id;
        }
    }

    async getGuild(guildId: string): Promise<Guild | null> {
        return await this.rest.get(
            Routes.guild(guildId)
        ) as Guild | null
    }

    async chooseGuild(): Promise<Guild | null> {
        await this.list()
        console.log("Please select a guild to continue")
        if (!this.guilds.length) {
            console.log("No available Guild\n");
            return null;
        }

        const indexStr = await this.requireInput(
            "Enter guild index (0-" + (this.guilds.length - 1) + "): ",
            (val) => {
                const num = Number(val);
                return !isNaN(num) && num >= 0 && num < this.guilds.length;
            },
            false
        );

        const index = Number(indexStr);
        return this.guilds[index] ?? null;
    }
}