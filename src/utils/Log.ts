export class Log {
    private static getPrefix(level: string): string {
        const now = new Date();
        const timestamp = `[${now.toLocaleDateString()} - ${now.toLocaleTimeString()}]`;
        return `${timestamp} [${level.toUpperCase()}]`;
    }

    static info(message: string): void {
        console.info(`${this.getPrefix('info')} ${message}`);
    }

    static warn(message: string): void {
        console.warn(`${this.getPrefix('warn')} ${message}`);
    }

    static error(message: string): void {
        console.error(`${this.getPrefix('error')} ${message}`);
    }
}
