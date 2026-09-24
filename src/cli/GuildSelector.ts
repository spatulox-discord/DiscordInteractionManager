import {REST} from "@discordjs/rest";
import {RESTAPIPartialCurrentUserGuild, Routes} from 'discord-api-types/v10';
import {Prompt} from "./utils/Prompt";

const GUILDS_PAGE_SIZE = 200;

export class GuildSelector {
    protected guilds: RESTAPIPartialCurrentUserGuild[] = [];
    protected rest: REST;

    constructor(token: string, private readonly input: Prompt = new Prompt()) {
        this.rest = new REST({ version: '10' }).setToken(token);
    }

    async list(printResult: boolean = true): Promise<RESTAPIPartialCurrentUserGuild[]> {
        console.clear();
        if(printResult) console.log("Guilds Selection\n");

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

    private async fetchAllGuilds(): Promise<RESTAPIPartialCurrentUserGuild[]> {
        const guilds: RESTAPIPartialCurrentUserGuild[] = [];
        let after: string | undefined;
        while (true) {
            const query = new URLSearchParams({limit: String(GUILDS_PAGE_SIZE)});
            if (after) query.set("after", after);

            const page = await this.rest.get(Routes.userGuilds(), {query}) as RESTAPIPartialCurrentUserGuild[];
            guilds.push(...page);

            const last = page[page.length - 1];
            if (page.length < GUILDS_PAGE_SIZE || !last) return guilds;
            after = last.id;
        }
    }

    async chooseGuild(): Promise<RESTAPIPartialCurrentUserGuild | null> {
        await this.list()
        console.log("Please select a guild to continue")
        if (!this.guilds.length) {
            console.log("No available Guild\n");
            return null;
        }

        const indexStr = await this.input.requireInput(
            "Enter guild index (0-" + (this.guilds.length - 1) + "): ",
            (val) => /^\d+$/.test(val.trim()) && Number(val) < this.guilds.length,
            false
        );

        const index = Number(indexStr.trim());
        return this.guilds[index] ?? null;
    }
}
