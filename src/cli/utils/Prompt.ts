import readline from "readline";

export class Prompt {
    private static rl: readline.Interface | null = null;

    ask(question: string): Promise<string> {
        if (!Prompt.rl) {
            Prompt.rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
        }
        const rl = Prompt.rl;
        return new Promise(resolve => rl.question(question, resolve));
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

    async yesNoInput(message: string): Promise<boolean> {
        while (true) {
            const value = (await this.ask(message)).trim().toLowerCase();
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
