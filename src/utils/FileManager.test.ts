import {describe, it} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {FileManager} from "./FileManager";

describe("FileManager.writeJsonFile", () => {
    it("creates missing folders of an absolute path", async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), "dim-test-"));
        try {
            const folder = path.join(root, "handlers", "commands");
            assert.equal(await FileManager.writeJsonFile(folder, "ping", {name: "ping"}), true);
            assert.deepEqual(JSON.parse(await fs.readFile(path.join(folder, "ping.json"), "utf8")), {name: "ping"});
        } finally {
            await fs.rm(root, {recursive: true, force: true});
        }
    });
});

describe("FileManager.fileExists", () => {
    it("tells whether a file exists without logging an error", async (t) => {
        const error = t.mock.method(console, "error", () => {});
        assert.equal(await FileManager.fileExists(path.join(os.tmpdir(), "dim-missing-file.json")), false);
        assert.equal(await FileManager.fileExists(os.tmpdir()), true);
        assert.equal(error.mock.callCount(), 0);
    });
});

describe("FileManager.isSafeFilename", () => {
    it("rejects names that leave the target folder", () => {
        for (const name of ["ping", "ping.json", "my command", "ping..json"]) {
            assert.equal(FileManager.isSafeFilename(name), true, name);
        }
        for (const name of ["", " ", ".", "..", "../ping", "a/b", "a\\b", "/etc/passwd"]) {
            assert.equal(FileManager.isSafeFilename(name), false, name);
        }
    });
});
