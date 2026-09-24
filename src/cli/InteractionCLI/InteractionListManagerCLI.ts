import {RESTAPIPartialCurrentUserGuild} from "discord-api-types/v10";
import {BaseCLI, MenuSelectionCLI} from "../BaseCLI";
import { BaseInteractionManager } from "../interactions/BaseInteractionManager";
import {GuildSelector} from "../GuildSelector";
import {Env} from "../../Env";
import {PathUtils} from "../../utils/PathUtils";
import {FileManager} from "../../utils/FileManager";

export class InteractionListManagerCLI extends BaseCLI {

    protected menuSelection: MenuSelectionCLI;
    protected readonly manager: BaseInteractionManager;
    protected readonly managerKey: string;

    protected getTitle(): string {
        return `${this.managerKey} - ${this.manager.folderPath}`;
    }

    constructor(parent: BaseCLI, manager: BaseInteractionManager, managerKey: string) {
        super(parent);
        this.manager = manager;
        this.managerKey = managerKey;
        this.menuSelection = [
            { label: `List Global ${this.manager.folderPath}`, action: () => this.listRemote() },
            { label: `List Specific ${this.manager.folderPath} for a Guild`, action: async () => this.guildListRemote(await this.guildSelector().chooseGuild()) },
            { label: `List ${this.manager.folderPath} for a Guild`, action: async () => this.guildListAllRemote(await this.guildSelector().chooseGuild()) },
            { label: `Count ${this.manager.folderPath} per Guilds`, action: async () => this.guildCountAllRemote() },
            { label: `Save global ${this.manager.folderPath} into local file`, action: async () => this.getAndSaveToLocalFile() },
            { label: 'Back', action: () => this.goBack() },
        ];
    }

    protected guildSelector(): GuildSelector {
        return new GuildSelector(Env.token, this.input);
    }

    protected async listRemote(): Promise<void> {
        await this.manager.list();
    }

    protected async guildListRemote(guild: RESTAPIPartialCurrentUserGuild | null): Promise<void> {
        if(!guild) {
            return
        }
        await this.manager.listGuild(guild.id)
    }

    protected async guildListAllRemote(guild: RESTAPIPartialCurrentUserGuild | null): Promise<void> {
        if(!guild) {
            return
        }
        let cmd = await this.manager.list(false)
        let cmd2 = await this.manager.listGuild(guild.id, false)

        console.log("Global Command")
        await this.manager.printInteraction(cmd)
        console.log("Specific Command to this guild")
        await this.manager.printInteraction(cmd2)
    }

    protected async guildCountAllRemote(): Promise<void> {
        await this.manager.listAllGuilds(await this.guildSelector().list(false))
    }

    protected async getAndSaveToLocalFile(){
        const commands  = await this.manager.list()
        const usedFilenames = new Set<string>();
        for (const cmd of commands) {
            // A user and a message context menu can share the same name
            let filename = FileManager.toSafeFilename(cmd.name);
            if (usedFilenames.has(filename.toLowerCase())) filename = `${filename}_${cmd.type}`;
            usedFilenames.add(filename.toLowerCase());
            await FileManager.writeJsonFile(PathUtils.createPathFolder("generated_"+this.manager.folderPath), filename, cmd)
        }
    }
}