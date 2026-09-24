import {RESTAPIPartialCurrentUserGuild} from "discord-api-types/v10";
import {BaseCLI, MenuSelectionCLI, NO_PAUSE} from "../BaseCLI";
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
        { label: `List ${this.manager.folderPath} deployed in this guild`, action: async () => this.offerDetails(await this.manager.listGuild(this.guild.id)) },
        { label: `List all ${this.manager.folderPath} available in this guild (global + guild)`, action: () => this.listAvailable() },
        { label: `List local ${this.manager.folderPath} files for this guild`, action: async () => this.offerDetails(await this.manager.listFromFile(Listing.ALL, this.guild.id)) },
        { label: "Deploy local to this guild", action: () => this.handleDeploy(this.guild) },
        { label: `Add a guild ${this.manager.folderPath} to this guild`, action: () => this.handleAdd() },
        { label: "Update in this guild", action: () => this.handleUpdate(this.guild) },
        { label: "Delete from this guild", action: () => this.handleDelete(this.guild) },
        { label: `Save this guild's ${this.manager.folderPath} into local files`, action: async () => this.saveToLocalFiles(await this.manager.listGuild(this.guild.id), this.guild.id) },
        { label: "Change guild", action: () => this.changeGuild() },
        { label: 'Back', action: () => this.goBack() },
    ];

    // Deploys guild files that do not target this guild yet, and adds the guild to them
    private async handleAdd(): Promise<void> {
        const selected = await this.selectCommands(await this.manager.listFromFile(Listing.ADDABLE, this.guild.id));
        if (selected.length === 0) return;
        await this.manager.deploy(selected);
    }

    // One table, so the numbers can be used to see the details (the GuildID column tells global ones apart)
    private async listAvailable(): Promise<typeof NO_PAUSE | void> {
        const commands = [...await this.manager.list(false), ...await this.manager.listGuild(this.guild.id, false)];
        console.log(`${commands.length} ${this.manager.folderPath}(s) available in this guild\n`);
        this.manager.printInteraction(commands);
        return this.offerDetails(commands);
    }

    private async changeGuild(): Promise<void> {
        const guild = await this.guildSelector().chooseGuild();
        if (guild) this.guild = guild;
    }
}
