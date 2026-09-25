import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Mutex} from "./Mutex";

describe("Mutex", () => {
    it("starts each function when the previous one ends, even when it fails", async () => {
        const mutex = new Mutex();
        const steps: string[] = [];
        const step = (name: string, fail = false) => async () => {
            steps.push(`${name} start`);
            await new Promise(resolve => setTimeout(resolve, 5));
            steps.push(`${name} end`);
            if (fail) throw new Error(name);
            return name;
        };

        const results = await Promise.allSettled([mutex.run(step("a", true)), mutex.run(step("b"))]);

        assert.deepEqual(steps, ["a start", "a end", "b start", "b end"]);
        assert.equal(results[0].status, "rejected");
        assert.deepEqual(results[1], {status: "fulfilled", value: "b"});
    });
});
