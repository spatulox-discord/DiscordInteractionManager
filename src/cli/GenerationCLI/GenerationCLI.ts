import {BaseCLI, MenuSelectionCLI} from "../BaseCLI";
import {ContextMenuGeneratorCLI} from "./ContextMenuGeneratorCLI";
import {SlashCommandGeneratorCLI} from "./SlashCommandsGeneratorCLI";

export class GenerationCLI extends BaseCLI {

    protected getTitle(): string {
        return '⚙️  Generation Manager CLI';
    }

    protected readonly menuSelection: MenuSelectionCLI = [
        { label: 'Generate Slash Command Template', action: () => new SlashCommandGeneratorCLI(this) },
        { label: 'Generate Context Menu Template', action: () => new ContextMenuGeneratorCLI(this) },
        { label: 'Back', action: () => this.goBack() },
    ];
}