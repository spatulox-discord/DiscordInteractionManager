import {BaseCLI} from "../BaseCLI";
import {DiscordRegex} from "../../utils/DiscordRegex";
import {
    ContextMenuConfigGenerator,
    SlashCommandConfigGenerator,
    SpecificCommandId
} from "../type/InteractionType";
import {Utils} from "../utils/Utils";
import {FolderName} from "../../type/FolderName";
import {FileManager} from "../../utils/FileManager";
import {PathUtils} from "../../utils/PathUtils";

export abstract class InteractionGeneratorCLI extends BaseCLI {
    protected abstract generate(): Promise<void>;

    protected async save(folderName: FolderName, config: ContextMenuConfigGenerator | SlashCommandConfigGenerator): Promise<void> {
        console.clear();
        console.log("✨ Final JSON preview:");
        console.log(JSON.stringify(config, null, 2));

        let filename: string;
        while (true) {
            filename = (await this.input.requireInput("Filename : ", FileManager.isSafeFilename)).trim().replace(/\.json$/i, '');
            if (!await FileManager.fileExists(PathUtils.createPathFile(folderName, `${filename}.json`))) break;
            if (await this.input.yesNoInput(`"${filename}" already exists. Overwrite? (y/n): `)) break;
        }

        if (!await this.input.yesNoInput("\nSave this file? (y/n): ")) {
            console.log("Cancelled");
            return;
        }

        if (await FileManager.writeJsonFile(PathUtils.createPathFolder(folderName), filename, config)) {
            console.log(`File saved: ${PathUtils.createPathFile(folderName, `${filename}.json`)}`);
        } else {
            console.error("The file could not be saved");
        }
    }

    protected async nsfw(config: SlashCommandConfigGenerator | ContextMenuConfigGenerator): Promise<void> {
        if(await this.input.yesNoInput("NSFW ? (y/n)")){
            config.nsfw = true
        }
    }

    protected async addPermissions(config: SlashCommandConfigGenerator | ContextMenuConfigGenerator): Promise<void> {
        console.clear();

        const permEntries = Utils.permissionEntries();
        const numberedPerms = permEntries.map(([name, _value], index) =>
            `${index}. ${name}`
        ).join('\n');

        console.log("Valid Permissions:\n" + numberedPerms);

        const input = await this.input.requireInput(
            "Permission numbers (comma-separated, 'everyone', or leave empty): ",
            (val) => {
                if (!val.trim() || val.trim().toLowerCase() === 'everyone') return true;
                return Utils.parseIndexList(val)?.every(num => num < permEntries.length) ?? false;
            },
            true
        );

        if (!input.trim() || input.trim().toLowerCase() === 'everyone') {
            return;
        }

        const selectedPermNames = Utils.parseIndexList(input)!.map(i => permEntries[i]![0]);

        config.default_member_permissions_string = selectedPermNames;
        config.default_member_permissions = Utils.permissionsToBitfield(selectedPermNames);
    }


    protected async optionalGuildIds(): Promise<SpecificCommandId | undefined> {
        const isCancel = (val: string) => !val.trim() || val.trim().toLowerCase() === 'none';
        const input = await this.input.requireInput(
            "Guild IDs (separated by comma, or 'none' to cancel): ",
            val => isCancel(val) || val.split(',').every(id => DiscordRegex.GUILD_ID.test(id.trim())),
            true
        );
        if (isCancel(input)) return undefined;
        return Object.fromEntries(input.split(',').map(id => [id.trim(), null]));
    }

    /**
     * Asks for values of a numeric enum (contexts, integration types).
     * @returns an empty list when left empty, to keep Discord's default
     */
    protected async selectEnumValues<T extends number>(label: string, enumObject: Record<string, string | number>): Promise<T[]> {
        const entries = Object.entries(enumObject).filter((entry): entry is [string, number] => typeof entry[1] === 'number');
        const values = entries.map(([, value]) => value);
        const choices = entries.map(([key, value]) => `${value}=${key}`).join(', ');

        const input = (await this.input.requireInput(
            `${label} (${choices}) separated by commas, "all", or leave empty for Discord's default: `,
            val => !val.trim() || val.trim().toLowerCase() === "all" || (Utils.parseIndexList(val)?.every(n => values.includes(n)) ?? false),
            true
        )).trim().toLowerCase();

        if (!input) return [];
        if (input === 'all') return values as T[];
        return Utils.parseIndexList(input) as T[];
    }
}