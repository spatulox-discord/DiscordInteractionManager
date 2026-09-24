import {beforeEach, describe, it, mock} from "node:test";
import assert from "node:assert/strict";
import {BaseCLI, MenuSelectionCLI} from "./BaseCLI";

let answers: string[] = [];

beforeEach(() => {
    mock.method(console, "log", () => {});
    mock.method(console, "clear", () => {});
    mock.method(BaseCLI.prototype as any, "prompt", async () => {
        const answer = answers.shift();
        if (answer === undefined) throw new Error("No more scripted answers");
        return answer;
    });
});

class ChildMenu extends BaseCLI {
    calls = 0;
    protected readonly menuSelection: MenuSelectionCLI = [
        {label: "Action", action: async () => { this.calls++; }},
        {label: "Back", action: () => this.goBack()},
    ];
    protected async execute(): Promise<void> {}
}

class ParentMenu extends BaseCLI {
    child = new ChildMenu(this);
    protected readonly menuSelection: MenuSelectionCLI = [
        {label: "Child", action: () => this.child},
        {label: "Back", action: () => this.goBack()},
    ];
    protected async execute(): Promise<void> {}
    run() { return this.showMainMenu(); }
}

describe("BaseCLI navigation", () => {
    it("returns to the parent menu and exits without nesting menus", async () => {
        answers = ["1", "1", "", "2", "9", "", "2"];
        const menu = new ParentMenu();

        await menu.run();

        assert.equal(menu.child.calls, 1);
        assert.deepEqual(answers, []);
    });

    it("leaves the menu when typing exit", async () => {
        answers = [" EXIT "];
        await new ParentMenu().run();
        assert.deepEqual(answers, []);
    });
});
