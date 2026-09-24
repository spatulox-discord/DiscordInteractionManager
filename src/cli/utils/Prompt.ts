import readline from "readline";

export class Prompt {
    private static rl: readline.Interface | null = null;

    ask(question: string): Promise<string> {
        const rl = Prompt.rl ??= Prompt.createInterface();
        return new Promise(resolve => rl.question(question, resolve));
    }

    /**
     * Ctrl+C, Ctrl+D or the end of a piped input quit right away, even during a long action:
     * readline catches Ctrl+C, so it only closed the interface and the next question failed.
     */
    static createInterface(input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout): readline.Interface {
        const rl = readline.createInterface({input, output});
        rl.on("SIGINT", () => Prompt.quit(130));
        rl.on("close", () => Prompt.quit(0));
        return rl;
    }

    private static quit(code: number): void {
        console.log("\n👋  Bye !");
        process.exit(code);
    }

    async requireInput(message: string, validator?: (val: string) => boolean, canBeEmpty: boolean = false): Promise<string> {
        while (true) {
            const value = await this.ask(message);
            if (!value && !canBeEmpty) {
                console.log("⚠️  This field is required. Please enter a value.");
                continue;
            }
            if (validator && !validator(value)) {
                console.log("⚠️  Invalid input. Try again.");
                continue;
            }
            return value;
        }
    }

    // Adds " (y/n): " to the question, so every yes / no prompt looks the same
    async yesNoInput(question: string): Promise<boolean> {
        while (true) {
            const value = (await this.ask(`${question} (y/n): `)).trim().toLowerCase();
            if (!value) {
                console.log("⚠️  This field is required. Please enter a value.");
                continue;
            }
            if (!["y", "n", "yes", "no"].includes(value)) {
                console.log("⚠️  Invalid input. Try again.");
                continue;
            }
            return value == "y" || value == "yes";
        }
    }
}
