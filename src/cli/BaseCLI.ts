#!/usr/bin/env node
import readline from "readline";
import {FileManager} from "../utils/FileManager";
import {Env} from "../Env";
import {PathUtils} from "../utils/PathUtils";
import {FolderName} from "../type/FolderName";
import {ContextMenuConfigGenerator, SlashCommandConfigGenerator} from "./type/InteractionType";

export const BACK = Symbol("back");

export type MenuSelectionCLI = {
    label: string;
    action: () => BaseCLI | typeof BACK | Promise<unknown> | null
}[]

/**
 * --- BaseCLI ---
 */
export abstract class BaseCLI {
    private static _rl: readline.Interface | null = null;
    protected static botName = "Unknown Bot";

    protected get rl() {
        if (!BaseCLI._rl) {
            BaseCLI._rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
        }
        return BaseCLI._rl;
    }

    constructor(protected parent?: BaseCLI) {}

    protected abstract readonly menuSelection: MenuSelectionCLI;
    protected abstract execute(): Promise<void>;

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

            const choice = (await this.prompt('Choose an option: ')).trim();
            if (choice.toLowerCase() === "exit") return;

            const option = this.menuSelection[Number(choice) - 1];
            if (!option) {
                console.log("Invalid choice");
            } else {
                const result = await option.action();
                if (result === BACK) return;
                if (result instanceof BaseCLI) {
                    if (result !== this) {
                        await result.showMainMenu();
                        continue;
                    }
                    await this.execute();
                }
            }

            await this.prompt('Press Enter to continue...');
        }
    }

    protected async prompt(question: string): Promise<string> {
        return new Promise(resolve => this.rl.question(question, resolve));
    }

    protected async requireInput(message: string, validator?: (val: string) => boolean, canBeEmpty: boolean = false): Promise<string>{
        while (true) {
            const value = (await this.prompt(message));
            if (!value && !canBeEmpty) {
                console.log("⚠️  This field is required. Please enter a value.");
                continue;
            }
            if (validator && !validator(value)) {
                console.log("⚠️  Invalid input. Try again.");
                continue;
            }
            return value;
        }
    }

    protected async yesNoInput(message: string): Promise<boolean> {
        while (true) {
            const value = (await this.prompt(message)).trim().toLowerCase();
            if (!value) {
                console.log("⚠️  This field is required. Please enter a value.");
                continue;
            }
            if (!["y", "n", "yes", "no"].includes(value)) {
                console.log("⚠️  Invalid input. Try again.");
                continue;
            }
            return value == "y" || value == "yes";
        }
    }

    protected async showHelp(): Promise<void> {
        console.clear();
        console.log('');
        console.log('||| HELP - Discord Bot Command Manager CLI |||');
        console.log('');
        console.log('🔗 Wiki: https://github.com/Spatulox/DiscordInteractionManager/wiki');
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
        console.log('🔗 Wiki: https://github.com/Spatulox/DiscordInteractionManager/wiki');
        console.log('🔗 Bugs: https://github.com/Spatulox/DiscordInteractionManager/issues')
        console.log('═'.repeat(80));
    }

    protected goBack(): typeof BACK {
        return BACK;
    }

    protected async save(folderName: FolderName,config: ContextMenuConfigGenerator | SlashCommandConfigGenerator): Promise<void> {
        let tmp: void | -1 = -1
        while (tmp == -1) {
            const filename = await this.requireInput("Filename : ", FileManager.isSafeFilename);
            tmp = await this.saveFile(folderName, filename, config);
        }
        return tmp
    }

    private async saveFile<T>(
        folderName: string,
        filename: string,
        data: T,
    ): Promise<-1 | void> {
        // 2. Preview + Confirmation
        console.clear();
        console.log("✨ Final JSON preview:");
        console.log(JSON.stringify(data, null, 2));

        let finalFilename = filename;
        if(await FileManager.fileExists(PathUtils.createPathFile(folderName, filename.replace(/\.json$/i, '') + ".json"))){
            if (!await this.yesNoInput(`"${finalFilename}" already exists. Overwrite? (y/n): `)) {
                return -1
            }
        }

        if (!await this.yesNoInput("\nSave this file? (y/n): ")) {
            console.log("Cancelled");
            return;
        }

        if (await FileManager.writeJsonFile(PathUtils.createPathFolder(folderName), finalFilename, data)) {
            console.log(`File saved: ${PathUtils.createPathFile(folderName, finalFilename)}`);
        } else {
            console.error("The file could not be saved");
        }

        return
    }
}
