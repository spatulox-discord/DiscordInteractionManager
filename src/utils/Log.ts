import {AsyncLocalStorage} from "node:async_hooks";

export type LogLevel = 'info' | 'warn' | 'error';
export type LogEntry = { level: LogLevel; message: string };

// Messages of the code run by Log.capture, e.g. to answer a request of the web UI
const captured = new AsyncLocalStorage<LogEntry[]>();

export class Log {
    private static getPrefix(level: string): string {
        const now = new Date();
        const timestamp = `[${now.toLocaleDateString()} - ${now.toLocaleTimeString()}]`;
        return `${timestamp} [${level.toUpperCase()}]`;
    }

    /**
     * Runs fn and returns the messages it logged instead of printing them.
     */
    static async capture<T>(fn: () => Promise<T>): Promise<{ result: T, messages: LogEntry[] }> {
        const messages: LogEntry[] = [];
        const result = await captured.run(messages, fn);
        return {result, messages};
    }

    static isCapturing(): boolean {
        return captured.getStore() !== undefined;
    }

    // A line of output, without prefix
    static print(message: string): void {
        if (!this.push('info', message)) console.log(message);
    }

    static info(message: string): void {
        if (!this.push('info', message)) console.info(`${this.getPrefix('info')} ${message}`);
    }

    static warn(message: string): void {
        if (!this.push('warn', message)) console.warn(`${this.getPrefix('warn')} ${message}`);
    }

    static error(message: string): void {
        if (!this.push('error', message)) console.error(`${this.getPrefix('error')} ${message}`);
    }

    private static push(level: LogLevel, message: string): boolean {
        const messages = captured.getStore();
        messages?.push({level, message});
        return messages !== undefined;
    }
}
