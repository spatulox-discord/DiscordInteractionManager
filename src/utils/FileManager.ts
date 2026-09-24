import path from 'path';
import fs from 'fs/promises';
import {Log} from "./Log";

export class FileManager {
    /**
     * Reads and parses a JSON file, logging the error on failure.
     * @param filePath Full path to the JSON file
     * @returns Parsed JSON object or false on failure
     */
    static async readJsonFile(filePath: string): Promise<unknown> {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            Log.error(`Failed to read JSON file ${filePath}: ${error}`);
            return false;
        }
    }

    // Example files are shipped as templates and never read as interactions
    static isExampleFile(filename: string): boolean {
        return /^example/i.test(filename.trim());
    }

    static isSafeFilename(filename: string): boolean {
        const name = filename.trim();
        return name !== '' && name !== '.' && name !== '..' && !/[\\/]/.test(name);
    }

    /**
     * Turns any text (e.g. an interaction name) into a filename that stays in its folder.
     */
    static toSafeFilename(name: string): string {
        const safe = name.trim().replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
        return this.isSafeFilename(safe) ? safe : '_';
    }

    static async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Writes to a temporary file first, so a crash or a full disk never leaves a truncated file (and its IDs lost).
     * The temporary file does not end with .json, so it is never listed.
     */
    static async writeFileAtomic(filePath: string, content: string): Promise<void> {
        const tmpPath = `${filePath}.${process.pid}.tmp`;
        try {
            await fs.writeFile(tmpPath, content);
            await fs.rename(tmpPath, filePath);
        } catch (error) {
            await fs.rm(tmpPath, {force: true});
            throw error;
        }
    }

    /**
     * Lists all JSON files in a directory.
     * @param directoryPath Path to scan for JSON files
     * @returns Array of JSON filenames or false on error
     */
    static async listJsonFiles(directoryPath: string): Promise<string[] | false> {
        try {
            const files = await fs.readdir(directoryPath);
            return files.filter(file => path.extname(file) === '.json');
        } catch (error) {
            Log.error(`Failed to read directory ${directoryPath}: ${error}`);
            return false;
        }
    }

    /**
     * Creates directory structure and writes JSON data to file.
     * @param directoryPath Full directory path (creates if missing)
     * @param filename Filename without extension
     * @param data Data to write (JSON serializable)
     * @returns true on success, false on failure
     */
    static async writeJsonFile(
        directoryPath: string,
        filename: string,
        data: unknown
    ): Promise<boolean> {
        // Skip if data is an Error array
        if (Array.isArray(data) && data.length === 1 && data[0] === 'Error') {
            Log.error(`Cannot save data for ${filename}: data contains 'Error'`);
            return false;
        }

        try {
            await fs.mkdir(directoryPath, { recursive: true });

            if (!filename || filename.trim() === '') {
                Log.error('Cannot write JSON file: empty filename');
                return false;
            }

            const cleanFilename = filename.replace(/\.json$/i, '');
            const filePath = path.join(directoryPath, `${cleanFilename}.json`);
            const jsonContent = JSON.stringify(data, null, 2);

            await this.writeFileAtomic(filePath, jsonContent);
            Log.info(`Successfully wrote data to ${filePath}`);
            return true;

        } catch (error) {
            const cleanFilename = filename.replace(/\.json$/i, '') || 'unknown';
            Log.error(`Failed to write file ${directoryPath}/${cleanFilename}.json: ${error}`);
            return false;
        }
    }
}