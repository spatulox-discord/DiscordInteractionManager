import {spawn} from "node:child_process";

/**
 * Opens the URL in the default browser. Errors are ignored: the URL is also printed in the terminal.
 */
export function openBrowser(url: string): void {
    const [command, args] = process.platform === "win32" ? ["cmd", ["/c", "start", '""', `"${url}"`]]
        : process.platform === "darwin" ? ["open", [url]]
        : ["xdg-open", [url]];
    try {
        const child = spawn(command, args as string[], {detached: true, stdio: "ignore", windowsVerbatimArguments: true});
        child.on("error", () => {});
        child.unref();
    } catch {
        // No browser to open
    }
}
