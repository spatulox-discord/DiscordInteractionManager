import {MenuSelectionCLI} from "../BaseCLI";
import {ContextMenuConfigGenerator, InteractionContextType, InteractionIntegrationType} from "../type/InteractionType";
import {InteractionGeneratorCLI} from "./InteractionGeneratorCLI";
import {FolderName} from "../../type/FolderName";

export class ContextMenuGeneratorCLI extends InteractionGeneratorCLI {
    protected getTitle(): string {
        return "🍽️ Context Menu JSON Generator";
    }

    protected readonly menuSelection: MenuSelectionCLI = [
        { label: "Generate Context Menu", action: () => this.generate() },
        { label: "Back", action: () => this.goBack() },
    ];

    protected async generate(): Promise<void> {
        const config: ContextMenuConfigGenerator = {
            command_scope: "global",
            name: "",
            type: 2
        };

        // 1. Type & Nom
        console.clear();
        console.log("🍽️ 1/6 - Menu Type");
        console.log("2 = User Menu | 3 = Message Menu");
        config.type = parseInt(await this.input.requireInput("Type (2 or 3): ", val => ["2", "3"].includes(val))) as 2 | 3;

        console.clear();
        config.name = (await this.input.requireInput("Name (1-32 chars): ", val => val.trim().length >= 1 && val.trim().length <= 32)).trim();
        await this.nsfw(config)

        // 2. Permissions
        console.clear();
        console.log("🔐 2/6 - Command Permissions");
        await this.addPermissions(config);

        console.clear();
        console.log("💬 3/6 - Context");
        const ctx = await this.selectEnumValues<InteractionContextType>("Contexts", InteractionContextType)
        if(ctx.length > 0){
            config.contexts = ctx
        }

        console.clear();
        console.log("💬 4/6 - Integration Type");
        const int_type = await this.selectEnumValues<InteractionIntegrationType>("Integration types", InteractionIntegrationType)
        if(int_type.length > 0){
            config.integration_types = int_type
        }

        // 5. Guild Specific
        console.clear();
        console.log("⚙️ 5/6 - Guild Specific");
        if(await this.input.yesNoInput("Guild specific?")) {
            config.command_scope = "guild"
            config.id = await this.chooseGuilds()
        }

        // 6. Save
        console.clear();
        console.log("💾 6/6 - Save");
        return await this.save(FolderName.CONTEXT_MENU, config)
    }
}