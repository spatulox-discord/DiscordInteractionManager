#!/usr/bin/env node
import {BaseCLI, MenuSelectionCLI} from "./BaseCLI";
import {InteractionCLI} from "./InteractionCLI/InteractionCLI";
import {GenerationCLI} from "./GenerationCLI/GenerationCLI";
import {Env} from "../Env";
import {CommandManager} from "./interactions/InteractionManager";

/**
 * --- MainCLI ---
 * Main controller for sub menu
 */
export class MainCLI extends BaseCLI {

    protected getTitle(): string {
        return "💠 Discord Interaction Manager CLI";
    }

    async start(): Promise<void> {
        try {
            BaseCLI.botName = await new CommandManager(Env.clientId, Env.token).getBotName();
        } catch (error) {
            throw new Error(`Cannot connect to Discord, check DISCORD_BOT_TOKEN and your connection (${(error as Error).message})`);
        }
        await this.showMainMenu();
    }

    protected readonly menuSelection: MenuSelectionCLI = [
        { label: "Manage Interactions", action: () => new InteractionCLI(this) },
        { label: "Generate Files", action: () => new GenerationCLI(this) },
        { label: "Help", action: () => this.showHelp() },
        { label: "Exit", action: () => this },
    ];

    protected execute(): Promise<void> {
        console.log("👋  Bye !")
        process.exit()
    }
}

async function main(): Promise<void> {
    try {
        void Env.clientId;
        void Env.token;
    } catch (error) {
        console.error(`❌ ${(error as Error).message}`);
        console.error("Set it in a .env file (see .env.example) or in your environment");
        process.exit(1);
    }

    await new MainCLI().start();
}

main().catch((error: Error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
});
