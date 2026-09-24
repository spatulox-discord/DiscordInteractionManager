#!/usr/bin/env node
import {BaseCLI, MenuSelectionCLI} from "./BaseCLI";
import {InteractionCLI} from "./InteractionCLI/InteractionCLI";
import {GenerationCLI} from "./GenerationCLI/GenerationCLI";
import {Env} from "../Env";
import {BaseInteractionManager} from "./interactions/BaseInteractionManager";
import {InteractionPayload} from "./interactions/InteractionPayload";

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
            const application = await BaseInteractionManager.fetchApplication(Env.token);
            BaseCLI.botName = application.name;
            BaseCLI.applicationId = application.id;
            BaseCLI.integrationTypes = InteractionPayload.defaultIntegrationTypes(application);
        } catch (error) {
            throw new Error(`Cannot connect to Discord, check DISCORD_BOT_TOKEN and your connection (${(error as Error).message})`);
        }
        await this.showMainMenu();
        this.exit();
    }

    protected readonly menuSelection: MenuSelectionCLI = [
        { label: "Manage Interactions", action: () => new InteractionCLI(this) },
        { label: "Generate Files", action: () => new GenerationCLI(this) },
        { label: "Help", action: () => this.showHelp() },
        { label: "Exit", action: () => this.exit() },
    ];

    private exit(): never {
        console.log("👋  Bye !")
        process.exit()
    }
}

async function main(): Promise<void> {
    try {
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
