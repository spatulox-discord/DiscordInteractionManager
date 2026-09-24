import {RESTAPIPartialCurrentUserGuild} from "discord-api-types/v10";
import {BaseCLI, MenuSelectionCLI} from "../BaseCLI";
import {BaseInteractionManager} from "../interactions/BaseInteractionManager";
import {Listing} from "../enum/Listing";
import {ScopeInteractionCLI} from "./ScopeInteractionCLI";

export class GuildInteractionCLI extends ScopeInteractionCLI {

    constructor(parent: BaseCLI, manager: BaseInteractionManager, managerKey: string, private guild: RESTAPIPartialCurrentUserGuild) {
        super(parent, manager, managerKey);
    }

    protected getTitle(): string {
        return `${this.managerKey} - Guild "${this.guild.name}" (${this.guild.id})`;
    }

    protected readonly menuSelection: MenuSelectionCLI = [
        { label: `List ${this.manager.folderPath} deployed in this guild`, action: () => this.manager.listGuild(this.guild.id) },
        { label: `List all ${this.manager.folderPath} available in this guild (global + guild)`, action: () => this.listAvailable() },
        { label: `List local ${this.manager.folderPath} files for this guild`, action: () => this.manager.listFromFile(Listing.ALL, this.guild.id) },
        { label: "Deploy local to this guild", action: () => this.handleDeploy(this.guild) },
        { label: "Update in this guild", action: () => this.handleUpdate(this.guild) },
        { label: "Delete from this guild", action: () => this.handleDelete(this.guild) },
        { label: `Save this guild's ${this.manager.folderPath} into local files`, action: async () => this.saveToLocalFiles(await this.manager.listGuild(this.guild.id), this.guild.id) },
        { label: `Count ${this.manager.folderPath} per guild`, action: async () => this.manager.listAllGuilds(await this.guildSelector().list(false)) },
        { label: "Change guild", action: () => this.changeGuild() },
        { label: 'Back', action: () => this.goBack() },
    ];

    private async listAvailable(): Promise<void> {
        const globalCommands = await this.manager.list(false)
        const guildCommands = await this.manager.listGuild(this.guild.id, false)

        console.log(`Global ${this.manager.folderPath}`)
        this.manager.printInteraction(globalCommands)
        console.log(`${this.manager.folderPath} specific to this guild`)
        this.manager.printInteraction(guildCommands)
    }

    private async changeGuild(): Promise<void> {
        const guild = await this.guildSelector().chooseGuild();
        if (guild) this.guild = guild;
    }
}
