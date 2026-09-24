import {beforeEach, describe, it, mock} from "node:test";
import assert from "node:assert/strict";
import {BaseCLI, MenuSelectionCLI} from "./BaseCLI";
import {Prompt} from "./utils/Prompt";

let answers: string[] = [];

beforeEach(() => {
    mock.method(console, "log", () => {});
    mock.method(console, "clear", () => {});
    mock.method(Prompt.prototype, "ask", async () => {
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
        {label: "Crash", action: async () => { throw new Error("boom"); }},
    ];
    run() { return this.showMainMenu(); }
}

class ParentMenu extends BaseCLI {
    child = new ChildMenu(this);
    protected readonly menuSelection: MenuSelectionCLI = [
        {label: "Child", action: () => this.child},
        {label: "Back", action: () => this.goBack()},
    ];
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

    it("keeps the menu running when an action fails", async (t) => {
        const error = t.mock.method(console, "error", () => {});
        answers = ["3", "", "1", "", "2"];
        const menu = new ChildMenu();

        await menu.run();

        assert.equal(menu.calls, 1);
        assert.equal(error.mock.callCount(), 1);
        assert.deepEqual(answers, []);
    });

    it("leaves the menu when typing exit", async () => {
        answers = [" EXIT "];
        await new ParentMenu().run();
        assert.deepEqual(answers, []);
    });
});
