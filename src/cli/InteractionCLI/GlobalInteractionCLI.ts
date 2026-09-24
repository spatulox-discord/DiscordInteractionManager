import {MenuSelectionCLI} from "../BaseCLI";
import {Listing} from "../enum/Listing";
import {ScopeInteractionCLI} from "./ScopeInteractionCLI";

export class GlobalInteractionCLI extends ScopeInteractionCLI {

    protected getTitle(): string {
        return `${this.managerKey} - Global ${this.manager.folderPath}`;
    }

    protected readonly menuSelection: MenuSelectionCLI = [
        { label: `List deployed ${this.manager.folderPath}`, action: () => this.manager.list() },
        { label: `List local ${this.manager.folderPath} files`, action: () => this.manager.listFromFile(Listing.ALL) },
        { label: "Deploy local", action: () => this.handleDeploy(null) },
        { label: "Update", action: () => this.handleUpdate(null) },
        { label: "Delete", action: () => this.handleDelete(null) },
        { label: `Save deployed ${this.manager.folderPath} into local files`, action: async () => this.saveToLocalFiles(await this.manager.list()) },
        { label: 'Back', action: () => this.goBack() },
    ];
}
