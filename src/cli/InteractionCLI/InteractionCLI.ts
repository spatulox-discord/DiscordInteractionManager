import {BaseCLI, MenuSelectionCLI} from "../BaseCLI";
import {CommandManager, ContextMenuManager} from "../interactions/InteractionManager";
import {InteractionManagerCLI} from "./InteractionManagerCLI";
import {Env} from "../../Env";

export class InteractionCLI extends BaseCLI {
    private readonly commandManager = new CommandManager(Env.clientId, Env.token);
    private readonly contextMenuManager = new ContextMenuManager(Env.clientId, Env.token);

    protected getTitle(): string {
        return '🔄 Interaction Manager CLI';
    }

    protected readonly menuSelection: MenuSelectionCLI = [
        { label: "Command Manager", action: () => new InteractionManagerCLI(this, this.commandManager, "CommandManager") },
        { label: "ContextMenu Manager", action: () => new InteractionManagerCLI(this, this.contextMenuManager, "ContextMenuManager") },
        { label: 'Back', action: () => this.goBack()},
    ];
}
