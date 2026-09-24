import {Env} from "../Env";
import {Prompt} from "./utils/Prompt";

export const BACK = Symbol("back");

export type MenuSelectionCLI = {
    label: string;
    action: () => BaseCLI | typeof BACK | Promise<unknown> | null
}[]

export abstract class BaseCLI {
    protected static botName = "Unknown Bot";
    protected static applicationId = "";

    constructor(parent?: BaseCLI, protected readonly input: Prompt = parent?.input ?? new Prompt()) {}

    protected abstract readonly menuSelection: MenuSelectionCLI;

    protected getTitle(): string {
        return "BaseCLI";
    }

    protected async showMainMenu(): Promise<void> {
        while (true) {
            console.clear();
            console.log(this.getTitle());
            console.log(`Connected as "${BaseCLI.botName}"`)
            console.log('═'.repeat(40));

            this.menuSelection.forEach((option, index) => {
                console.log(`${index + 1}. ${option.label}`);
            });
            console.log('═'.repeat(40));

            const choice = (await this.input.ask('Choose an option: ')).trim();
            if (choice.toLowerCase() === "exit") return;

            const option = this.menuSelection[Number(choice) - 1];
            if (!option) {
                console.log("Invalid choice");
            } else {
                const result = await option.action();
                if (result === BACK) return;
                if (result instanceof BaseCLI) {
                    await result.showMainMenu();
                    continue;
                }
            }

            await this.input.ask('Press Enter to continue...');
        }
    }

    protected async showHelp(): Promise<void> {
        console.clear();
        console.log('');
        console.log('||| HELP - Discord Interaction Manager CLI |||');
        console.log('');
        console.log('🔗 Wiki: https://github.com/spatulox-discord/DiscordInteractionManager/wiki');
        console.log('═'.repeat(80));
        console.log('🤖 What it does:');
        console.log('  • Manage your Discord interactions (slash commands & context menus) via an interactive CLI');
        console.log('  • Let you deploy/update/delete any interaction');
        console.log('  • Let you generate interactions files');

        console.log('');
        console.log('How generated interaction files are stored');
        console.log('📁 Folder Structure:');
        console.log(`  ├── ${Env.interactionFolderPath}/`);
        console.log('  │   ├── commands/     ← Slash Commands (type 1)');
        console.log('  │   └── context_menu/ ← Context Menus (type 2/3)');
        console.log('  Files whose name starts with "example" are ignored');

        console.log('');
        console.log('🎯 Features:');
        console.log('  📊 1. List Remote    → Show deployed commands on Discord');
        console.log('  🚀 2. Deploy Local   → Deploy local JSON files → Discord');
        console.log('  🔄 3. Update Remote  → Update Discord commands based on local JSON file');
        console.log('  🗑️ 4. Delete Remote → Remove Discord commands based on local JSON file');

        console.log('');
        console.log('🎮 Selection:');
        console.log('  • Numbered lists appear after the interaction list');
        console.log('  • Enter: "1,3,5" or "all" to select which interaction you want to apply the action');

        console.log('');
        console.log('🔗 Wiki: https://github.com/spatulox-discord/DiscordInteractionManager/wiki');
        console.log('🔗 Bugs: https://github.com/spatulox-discord/DiscordInteractionManager/issues')
        console.log('═'.repeat(80));
    }

    protected goBack(): typeof BACK {
        return BACK;
    }
}
