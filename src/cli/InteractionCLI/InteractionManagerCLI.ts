import {RESTAPIPartialCurrentUserGuild} from "discord-api-types/v10";
import {BaseCLI} from "../BaseCLI";
import {BaseInteractionManager} from "../interactions/BaseInteractionManager";
import {InteractionListManagerCLI} from "./InteractionListManagerCLI";
import {Interaction} from "../type/InteractionType";
import {Listing} from "../enum/Listing";
import {Utils} from "../utils/Utils";

export class InteractionManagerCLI extends InteractionListManagerCLI {

    constructor(parent: BaseCLI, manager: BaseInteractionManager, managerKey: string) {
        super(parent, manager, managerKey);
        this.menuSelection = [
            { label: `List ${this.manager.folderPath}`, action: () => new InteractionListManagerCLI(this, manager, this.managerKey) },
            { label: "Deploy local", action: () => this.handleDeploy() },
            { label: "Update remote", action: () => this.handleUpdate() },
            { label: "Delete remote", action: () => this.handleDelete() },
            { label: 'Back', action: () => this.goBack() },
        ];
    }

    private async handleDeploy(): Promise<void> {
        const selected = await this.selectCommands(this.manager, await this.manager.listFromFile(Listing.LOCAL));
        if (selected.length === 0) return;
        await this.manager.deploy(selected);
    }

    private async handleUpdate(): Promise<void> {
        let guild: RESTAPIPartialCurrentUserGuild | null = null
        const rep = await this.input.yesNoInput("Do you want to update a global command or a specific guild command (y=global/n=specific): ")

        console.log('═'.repeat(80));
        console.log(`ACTUAL DEPLOYED ${this.manager.folderPath?.toUpperCase()}`)
        if(rep){
            console.log("Specific guild interaction cannot be detected here, but can still be updated")
            await this.listRemote()
        } else {
            guild = await this.guildSelector().chooseGuild()
            if(!guild){
                console.log("Error, cannot find guild")
                return
            }
            await this.guildListRemote(guild);
        }
        console.log('═'.repeat(80));
        console.log(`ACTUAL LOCAL ${this.manager.folderPath?.toUpperCase()}`)
        const selected = await this.selectCommands(this.manager, await this.manager.listFromFile(Listing.DEPLOYED, guild?.id));
        if (selected.length === 0) return;
        await this.manager.update(selected, guild);
    }

    private async handleDelete(): Promise<void> {

        const rep = await this.input.yesNoInput("Do you want to delete a global command or a specific guild command (y=global/n=specific): ")
        let guild: RESTAPIPartialCurrentUserGuild | null = null
        let commands: Interaction[]
        if(rep){
            commands = await this.manager.list()
        } else {
            guild = await this.guildSelector().chooseGuild()
            if(!guild){
                console.log("Error, cannot find guild")
                return
            }
            commands = await this.manager.listGuild(guild?.id)
        }

        const selected = await this.selectCommands(this.manager, commands);
        if (selected.length === 0) return;
        await this.manager.delete(selected, guild);
    }

    private async selectCommands(manager: BaseInteractionManager, commands: Interaction[]): Promise<Interaction[]> {
        const handlerManagerType = `${manager.folderPath}(s)`;

        if (!commands?.length) {
            console.log(`No ${handlerManagerType} found`);
            return [];
        }

        const input = (await this.input.ask('Enter numbers (separated by a comma, or "all" or "exit"): ')).trim().toLowerCase();
        if (input === 'all') return commands;
        if (input === 'exit') return [];

        const indices = Utils.parseIndexList(input);
        if (!indices || indices.some(i => i >= commands.length)) {
            console.log('Invalid number');
            return [];
        }
        const selected = indices.map(i => commands[i]!);

        console.log(`${selected.length} selected ${handlerManagerType}`);
        return selected;
    }
}