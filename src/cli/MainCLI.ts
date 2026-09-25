#!/usr/bin/env node
import {BaseCLI, MenuSelectionCLI} from "./BaseCLI";
import {InteractionCLI} from "./InteractionCLI/InteractionCLI";
import {GenerationCLI} from "./GenerationCLI/GenerationCLI";
import {Env} from "../Env";
import {BaseInteractionManager} from "./interactions/BaseInteractionManager";
import {InteractionPayload} from "./interactions/InteractionPayload";
import {RESTGetCurrentApplicationResult} from "discord-api-types/v10";
import {DEFAULT_PORT, WebServer} from "../web/WebServer";
import {openBrowser} from "../web/openBrowser";

/**
 * --- MainCLI ---
 * Main controller for sub menu
 */
export class MainCLI extends BaseCLI {

    protected getTitle(): string {
        return "💠 Discord Interaction Manager CLI";
    }

    private application!: RESTGetCurrentApplicationResult;
    private webUrl: string | null = null;

    async start(): Promise<void> {
        this.application = await connect();
        BaseCLI.botName = this.application.name;
        BaseCLI.applicationId = this.application.id;
        BaseCLI.integrationTypes = InteractionPayload.defaultIntegrationTypes(this.application);
        await this.showMainMenu();
        this.exit();
    }

    protected readonly menuSelection: MenuSelectionCLI = [
        { label: "Manage Interactions", action: () => new InteractionCLI(this) },
        { label: "Generate Files", action: () => new GenerationCLI(this) },
        { label: "Open Web UI", action: () => this.openWebUI() },
        { label: "Help", action: () => this.showHelp() },
        { label: "Exit", action: () => this.exit() },
    ];

    // The server runs until the CLI exits, and the menus stay usable meanwhile
    private async openWebUI(): Promise<void> {
        this.webUrl ??= await new WebServer({token: Env.token, application: this.application}).start();
        openBrowser(this.webUrl);
        console.log(`🌐 Web UI: ${this.webUrl}`);
        console.log("It stops when you exit the CLI");
    }

    private exit(): never {
        console.log("👋  Bye !")
        process.exit()
    }
}

async function connect(): Promise<RESTGetCurrentApplicationResult> {
    try {
        return await BaseInteractionManager.fetchApplication(Env.token);
    } catch (error) {
        throw new Error(`Cannot connect to Discord, check DISCORD_BOT_TOKEN and your connection (${(error as Error).message})`);
    }
}

/**
 * dim web [--port <port>] [--no-open]
 */
async function startWeb(args: string[]): Promise<void> {
    const portIndex = args.indexOf("--port");
    const port = portIndex === -1 ? DEFAULT_PORT : Number(args[portIndex + 1]);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--port expects a port number (0-65535)");

    const application = await connect();
    const url = await new WebServer({token: Env.token, application, port}).start();
    console.log(`💠 Discord Interaction Manager, connected as "${application.name}"`);
    console.log(`🌐 Web UI: ${url}`);
    console.log("Only this URL gives access to the UI. Press Ctrl+C to stop");
    if (!args.includes("--no-open")) openBrowser(url);
}

async function main(): Promise<void> {
    try {
        void Env.token;
    } catch (error) {
        console.error(`❌ ${(error as Error).message}`);
        console.error("Set it in a .env file (see .env.example) or in your environment");
        process.exit(1);
    }

    const [command, ...args] = process.argv.slice(2);
    if (command === "web") {
        await startWeb(args);
    } else {
        await new MainCLI().start();
    }
}

main().catch((error: Error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
});
