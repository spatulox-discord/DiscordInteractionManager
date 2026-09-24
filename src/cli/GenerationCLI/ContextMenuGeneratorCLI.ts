import {MenuSelectionCLI} from "../BaseCLI";
import {ContextMenuConfigGenerator} from "../type/InteractionType";
import {InteractionGeneratorCLI} from "./InteractionGeneratorCLI";
import {FolderName} from "../../type/FolderName";

export class ContextMenuGeneratorCLI extends InteractionGeneratorCLI {
    protected getTitle(): string {
        return "🍽️ Context Menu JSON Generator";
    }

    protected readonly menuSelection: MenuSelectionCLI = [
        { label: "Generate Context Menu", action: () => this },
        { label: "Back", action: () => this.goBack() },
    ];

    protected async execute(): Promise<void> {
        const config: ContextMenuConfigGenerator = {
            command_scope: "global",
            id: "",
            dm_permission: true,
            name: "",
            type: 2
        };

        // 1. Type & Nom
        console.clear();
        console.log("🍽️ 1/7 - Menu Type");
        console.log("2 = User Menu | 3 = Message Menu");
        config.type = parseInt(await this.requireInput("Type (2 or 3): ", val => ["2", "3"].includes(val))) as 2 | 3;

        console.clear();
        config.name = await this.requireInput("Name (1-32 chars): ", val => val.length >= 1 && val.length <= 32);
        await this.nsfw(config)

        // 2. Permissions
        console.clear();
        console.log("🔐 2/7 - Command Permissions");
        await this.addPermissions(config);

        // 3. DM
        console.clear();
        console.log("💬 3/7 - DM Permissions");
        config.dm_permission = await this.yesNoInput("Authorize in DM ? (y/n): ");

        console.clear();
        console.log("💬 4/7 - Context");
        const ctx = await this.context()
        if(ctx.length > 0){
            config.contexts = ctx
        }

        console.clear();
        console.log("💬 5/7 - Integration Type");
        const int_type = await this.integration_context()
        if(int_type.length > 0){
            config.integration_types = int_type
        }

        // 4. Guild Specific
        console.clear();
        console.log("⚙️ 6/7 - Guild Specific");
        if(await this.yesNoInput("Guild Specific ? (y/n): ")) {
            const id = await this.optionalGuildIds();
            if(id) {
                config.id = id
                config.command_scope = "guild"
            }
        }

        // 5. Save
        console.clear();
        console.log("💾 7/7 - Save");
        return await this.save(FolderName.CONTEXT_MENU, config)
    }
}