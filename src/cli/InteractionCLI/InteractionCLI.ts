import {BaseCLI, MenuSelectionCLI} from "../BaseCLI";
import {CommandManager, ContextMenuManager} from "../interactions/InteractionManager";
import {InteractionManagerCLI} from "./InteractionManagerCLI";
import {Env} from "../../Env";

export class InteractionCLI extends BaseCLI {
    private readonly commandManager = new CommandManager(BaseCLI.applicationId, Env.token, BaseCLI.integrationTypes);
    private readonly contextMenuManager = new ContextMenuManager(BaseCLI.applicationId, Env.token, BaseCLI.integrationTypes);

    protected getTitle(): string {
        return '🔄 Interaction Manager CLI';
    }

    protected readonly menuSelection: MenuSelectionCLI = [
        { label: "Command Manager", action: () => new InteractionManagerCLI(this, this.commandManager, "CommandManager") },
        { label: "ContextMenu Manager", action: () => new InteractionManagerCLI(this, this.contextMenuManager, "ContextMenuManager") },
        { label: 'Back', action: () => this.goBack()},
    ];
}
