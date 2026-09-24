import {BaseCLI, MenuSelectionCLI} from "../BaseCLI";
import {BaseInteractionManager} from "../interactions/BaseInteractionManager";
import {GuildSelector} from "../GuildSelector";
import {Env} from "../../Env";
import {GlobalInteractionCLI} from "./GlobalInteractionCLI";
import {GuildInteractionCLI} from "./GuildInteractionCLI";

export class InteractionManagerCLI extends BaseCLI {

    constructor(parent: BaseCLI, private readonly manager: BaseInteractionManager, private readonly managerKey: string) {
        super(parent);
    }

    protected getTitle(): string {
        return `${this.managerKey} - ${this.manager.folderPath}`;
    }

    protected readonly menuSelection: MenuSelectionCLI = [
        { label: `Global ${this.manager.folderPath}`, action: () => new GlobalInteractionCLI(this, this.manager, this.managerKey) },
        { label: `Guild ${this.manager.folderPath}`, action: () => this.openGuild() },
        { label: 'Back', action: () => this.goBack() },
    ];

    // Stays in this menu when no guild is chosen
    private async openGuild(): Promise<GuildInteractionCLI | null> {
        const guild = await new GuildSelector(Env.token, this.input).chooseGuild();
        return guild ? new GuildInteractionCLI(this, this.manager, this.managerKey, guild) : null;
    }
}
