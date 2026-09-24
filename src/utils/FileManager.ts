import path from 'path';
import fs from 'fs/promises';
import {Log} from "./Log";

export class FileManager {
    /**
     * Reads a JSON file synchronously.
     * @param filePath Full path to the JSON file
     * @returns Parsed JSON object or 'Error' string on failure
     */
    static async readJsonFile(filePath: string): Promise<any | false> {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            Log.error(`Failed to read JSON file ${filePath}: ${error}`);
            return false;
        }
    }

    /**
     * Lists all directories in a given path.
     * @param directoryPath Path to scan for directories
     * @returns Array of directory names or false on error
     */
    static async listDirectories(directoryPath: string): Promise<string[] | false> {
        try {
            const files = await fs.readdir(directoryPath, { withFileTypes: true });
            return files
                .filter(file => file.isDirectory())
                .map(dir => dir.name);
        } catch (error) {
            Log.error(`Failed to read directory ${directoryPath}: ${error}`);
            return false;
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
     * Lists files with specific extension in a directory.
     * @param directoryPath Path to scan
     * @param extension File extension (with or without dot)
     * @returns Array of matching filenames or 'Error' string on failure
     */
    static async listFiles(directoryPath: string, extension: string): Promise<string[] | false> {
        try {
            let ext = extension;
            if (ext.startsWith('.')) {
                ext = ext.slice(1);
            }

            const files = await fs.readdir(directoryPath);
            return files.filter(file => path.extname(file) === `.${ext}`);
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
        data: any
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

            await fs.writeFile(filePath, jsonContent);
            Log.info(`Successfully wrote data to ${filePath}`);
            return true;

        } catch (error) {
            const cleanFilename = filename.replace(/\.json$/i, '') || 'unknown';
            Log.error(`Failed to write file ${directoryPath}/${cleanFilename}.json: ${error}`);
            return false;
        }
    }
}