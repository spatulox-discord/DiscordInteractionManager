import {MenuSelectionCLI, NO_PAUSE} from "../BaseCLI";
import {ALL_GUILDS, Listing} from "../enum/Listing";
import {Interaction} from "../type/InteractionType";
import {InteractionDetails} from "../interactions/InteractionDetails";
import {ScopeInteractionCLI} from "./ScopeInteractionCLI";

/**
 * Guild interactions in every guild at once.
 */
export class AllGuildsInteractionCLI extends ScopeInteractionCLI {

    protected getTitle(): string {
        return `${this.managerKey} - All guilds`;
    }

    protected readonly menuSelection: MenuSelectionCLI = [
        { label: `List guild ${this.manager.folderPath} deployed per guild`, action: () => this.listPerGuild() },
        { label: `Count ${this.manager.folderPath} per guild`, action: async () => this.manager.countPerGuild(await this.guildSelector().list(false)) },
        { label: "Update in all their guilds", action: () => this.handleUpdateAll() },
        { label: "Delete from all guilds", action: () => this.handleDeleteAll() },
        { label: 'Back', action: () => this.goBack() },
    ];

    private async listPerGuild(): Promise<typeof NO_PAUSE | void> {
        return this.offerDetails(await this.fetchPerGuild());
    }

    private async handleUpdateAll(): Promise<void> {
        const selected = await this.selectCommands(await this.manager.listFromFile(Listing.DEPLOYED, ALL_GUILDS));
        if (selected.length === 0) return;
        await this.manager.update(selected, null);
    }

    // Lists from Discord, so interactions without a local file can be deleted too
    private async handleDeleteAll(): Promise<void> {
        const selected = await this.selectCommands(await this.fetchPerGuild());
        if (!await this.confirmDeletion(selected, "from every guild they are deployed in")) return;
        await this.manager.delete(selected, null);
    }

    private async fetchPerGuild(): Promise<Interaction[]> {
        const guilds = await this.guildSelector().list(false);
        console.log(`📡 Getting the guild ${this.manager.folderPath} of ${guilds.length} guild(s)...\n`);
        const commands = await this.manager.listPerGuild(guilds);

        console.log(`${commands.length} guild ${this.manager.folderPath}(s) found\n`);
        console.table(commands.map(cmd => ({
            Name: cmd.name,
            Type: InteractionDetails.typeLabel(cmd.type),
            Guilds: cmd.command_scope === "guild" ? Object.keys(cmd.id).length : 0,
            "Local file": cmd.filename ?? "(none)",
        })));
        return commands;
    }
}
