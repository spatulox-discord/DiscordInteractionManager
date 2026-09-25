import {RESTAPIPartialCurrentUserGuild} from "discord-api-types/v10";
import {BaseCLI, NO_PAUSE} from "../BaseCLI";
import {BaseInteractionManager} from "../interactions/BaseInteractionManager";
import {InteractionDetails} from "../interactions/InteractionDetails";
import {GuildSelector} from "../GuildSelector";
import {Env} from "../../Env";
import {Interaction} from "../type/InteractionType";
import {Listing} from "../enum/Listing";
import {Utils} from "../utils/Utils";

/**
 * Actions shared by the Global and Guild menus. A null guild means global interactions.
 */
export abstract class ScopeInteractionCLI extends BaseCLI {

    constructor(parent: BaseCLI, protected readonly manager: BaseInteractionManager, protected readonly managerKey: string) {
        super(parent);
    }

    protected guildSelector(): GuildSelector {
        return new GuildSelector(Env.token, this.input);
    }

    protected async handleDeploy(guild: RESTAPIPartialCurrentUserGuild | null): Promise<void> {
        const selected = await this.selectCommands(await this.manager.listFromFile(Listing.LOCAL, guild?.id));
        if (selected.length === 0) return;
        await this.manager.deploy(selected);
    }

    protected async handleUpdate(guild: RESTAPIPartialCurrentUserGuild | null): Promise<void> {
        console.log('═'.repeat(80));
        console.log(`ACTUAL DEPLOYED ${this.manager.folderPath.toUpperCase()}`)
        if (guild) {
            await this.manager.listGuild(guild.id);
        } else {
            await this.manager.list();
        }
        console.log('═'.repeat(80));
        console.log(`ACTUAL LOCAL ${this.manager.folderPath.toUpperCase()}`)
        const selected = await this.selectCommands(await this.manager.listFromFile(Listing.DEPLOYED, guild?.id));
        if (selected.length === 0) return;
        await this.manager.update(selected, guild);
    }

    protected async handleDelete(guild: RESTAPIPartialCurrentUserGuild | null): Promise<void> {
        const commands = guild ? await this.manager.listGuild(guild.id) : await this.manager.list();
        const selected = await this.selectCommands(commands);
        if (!await this.confirmDeletion(selected, guild ? `from guild "${guild.name}"` : "globally")) return;
        await this.manager.delete(selected, guild);
    }

    // A deletion cannot be undone, and "all" selects everything at once
    protected async confirmDeletion(selected: Interaction[], where: string): Promise<boolean> {
        if (selected.length === 0) return false;
        const names = selected.map(cmd => cmd.name).join(", ");
        if (await this.input.yesNoInput(`Delete ${names} ${where}?`)) return true;
        console.log("Cancelled");
        return false;
    }

    protected async selectCommands(commands: Interaction[]): Promise<Interaction[]> {
        const handlerManagerType = `${this.manager.folderPath}(s)`;

        if (!commands?.length) {
            console.log(`No ${handlerManagerType} found`);
            return [];
        }

        while (true) {
            const input = (await this.input.ask('Enter numbers (separated by a comma), "all", or Enter to cancel: ')).trim().toLowerCase();
            if (input === 'all') return commands;
            if (!input || input === 'exit') return [];

            const indices = Utils.parseIndexList(input);
            if (!indices || indices.some(i => i >= commands.length)) {
                console.log('Invalid number');
                continue;
            }
            const selected = indices.map(i => commands[i]!);

            console.log(`${selected.length} selected ${handlerManagerType}`);
            return selected;
        }
    }

    /**
     * After a listing, shows the details of the chosen interactions until the user presses Enter.
     */
    protected async offerDetails(commands: Interaction[]): Promise<typeof NO_PAUSE | void> {
        if (commands.length === 0) return;

        while (true) {
            const input = (await this.input.ask('Numbers to see the details (separated by a comma, or Enter to go back): ')).trim();
            if (!input) return NO_PAUSE;

            const indices = Utils.parseIndexList(input);
            if (!indices || indices.some(i => i >= commands.length)) {
                console.log('Invalid number');
                continue;
            }
            for (const i of indices) {
                console.log('\n' + InteractionDetails.format(commands[i]!).join('\n'));
            }
            console.log('');
        }
    }
}
