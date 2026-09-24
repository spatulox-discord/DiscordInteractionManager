import {Env} from "../Env";
import {Prompt} from "./utils/Prompt";

export const BACK = Symbol("back");
// Returned by an action that already waited for the user, to skip "Press Enter to continue"
export const NO_PAUSE = Symbol("no pause");

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
                try {
                    const result = await option.action();
                    if (result === BACK) return;
                    if (result === NO_PAUSE) continue;
                    if (result instanceof BaseCLI) {
                        await result.showMainMenu();
                        continue;
                    }
                } catch (error) {
                    console.error(`❌ ${(error as Error).message}`);
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
        console.log('🎯 Features (Manage Interactions → Command / ContextMenu Manager):');
        console.log('  🌍 Global → Global interactions only');
        console.log('  🏠 Guild  → Choose a guild once, every action only applies to that guild');
        console.log('  🌐 All guilds → Guild interactions in every guild: list with their number of guilds, count per guild, update in all their guilds, delete from all guilds');
        console.log('  In the Global and Guild menus:');
        console.log('  📊 List    → Show deployed interactions on Discord, or local JSON files, then enter numbers to see their details');
        console.log('  🚀 Deploy  → Deploy local JSON files → Discord');
        console.log('  🔄 Update  → Update Discord interactions based on local JSON files');
        console.log('  🗑️ Delete  → Remove Discord interactions and their ID from local JSON files');
        console.log('  💾 Save    → Save deployed interactions into generated_* JSON files');
        console.log('  The Guild menu can also add a guild interaction to the guild and list everything available in the guild');

        console.log('');
        console.log('🎮 Selection:');
        console.log('  • Numbered lists appear after the interaction list');
        console.log('  • Enter: "1,3,5" or "all" to select which interaction you want to apply the action, or nothing to cancel');

        console.log('');
        console.log('🔗 Wiki: https://github.com/spatulox-discord/DiscordInteractionManager/wiki');
        console.log('🔗 Bugs: https://github.com/spatulox-discord/DiscordInteractionManager/issues')
        console.log('═'.repeat(80));
    }

    protected goBack(): typeof BACK {
        return BACK;
    }
}
