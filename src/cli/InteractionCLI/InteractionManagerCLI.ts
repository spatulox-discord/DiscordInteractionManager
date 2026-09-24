import {BaseCLI, MenuSelectionCLI} from "../BaseCLI";
import {BaseInteractionManager} from "../interactions/BaseInteractionManager";
import {GuildListManager} from "../GuildListManager";
import {Env} from "../../Env";
import {InteractionListManagerCLI} from "./InteractionListManagerCLI";
import {Guild} from "discord.js";
import {Interaction} from "../type/InteractionType";
import {Listing} from "../enum/Listing";

export class InteractionManagerCLI extends InteractionListManagerCLI {

    protected menuSelection: MenuSelectionCLI;
    protected readonly manager: BaseInteractionManager;
    protected readonly managerKey: string;

    protected getTitle(): string {
        return `${this.managerKey} - ${this.manager.folderPath}`;
    }
    constructor(parent: BaseCLI, manager: BaseInteractionManager, managerKey: string) {
        super(parent, manager, managerKey);
        this.manager = manager;
        this.managerKey = managerKey;
        this.menuSelection = [
            { label: `List ${this.manager.folderPath}`, action: () => new InteractionListManagerCLI(this, manager, this.managerKey) },
            { label: "Deploy local", action: () => this.handleDeploy() },
            { label: "Update remote", action: () => this.handleUpdate() },
            { label: "Delete remote", action: () => this.handleDelete() },
            { label: 'Back', action: () => this.goBack() },
        ];
    }

    protected execute(): Promise<void> {
        throw new Error("Method not implemented.");
    }

    private async handleDeploy(): Promise<void> {
        const selected = await this.selectCommands(this.manager, await this.manager.listFromFile(Listing.LOCAL));
        if (selected.length === 0) return;
        await this.manager.deploy(selected);
    }

    private async handleUpdate(): Promise<void> {
        let guild: Guild | null = null
        const rep = await this.yesNoInput("Do you want to update a global command or a specific guild command (y=global/n=specific): ")

        console.log('═'.repeat(80));
        console.log(`ACTUAL DEPLOYED ${this.manager.folderPath?.toUpperCase()}`)
        if(rep){
            console.log("Specific guild interaction cannot be detected here, but can still be updated")
            await this.listRemote()
        } else {
            guild = await new GuildListManager(Env.clientId, Env.token).chooseGuild()
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

        const rep = await this.yesNoInput("Do you want to delete a global command or a specific guild command (y=global/n=specific): ")
        let guild: Guild | null = null
        let commands: Interaction[]
        if(rep){
            commands = await this.manager.list()
        } else {
            guild = await new GuildListManager(Env.clientId, Env.token).chooseGuild()
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

        const input = await this.prompt('Enter numbers (sperated by a comma, or "all" or "exit"): ');
        if (input.toLowerCase() === 'all') return commands;
        if (input.toLowerCase() === 'exit') return [];

        const indices = input.split(',').map(i => parseInt(i.trim())).filter(i => !isNaN(i));
        const selected = indices
            .map(i => commands[i])
            .filter((cmd): cmd is Interaction => cmd !== undefined);

        if (selected.length === 0) {
            console.log('Invalid number');
            return [];
        }

        console.log(`${selected.length} selected ${handlerManagerType}`);
        return selected;
    }
}