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

describe("FileManager.writeFileAtomic", () => {
    it("replaces the file without leaving a temporary file", async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), "dim-test-"));
        try {
            const file = path.join(root, "ping.json");
            await fs.writeFile(file, "old");
            await FileManager.writeFileAtomic(file, "new");
            assert.equal(await fs.readFile(file, "utf8"), "new");
            assert.deepEqual(await fs.readdir(root), ["ping.json"]);
        } finally {
            await fs.rm(root, {recursive: true, force: true});
        }
    });

    it("removes the temporary file when the write fails", async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), "dim-test-"));
        try {
            // A folder cannot be replaced by a file
            await fs.mkdir(path.join(root, "ping.json"));
            await assert.rejects(FileManager.writeFileAtomic(path.join(root, "ping.json"), "new"));
            assert.deepEqual(await fs.readdir(root), ["ping.json"]);
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
        for (const name of ["ping", "ping.json", "my command", "ping..json", "console", "auxiliary"]) {
            assert.equal(FileManager.isSafeFilename(name), true, name);
        }
        for (const name of ["", " ", ".", "..", "../ping", "a/b", "a\\b", "/etc/passwd"]) {
            assert.equal(FileManager.isSafeFilename(name), false, name);
        }
    });

    it("rejects names Windows cannot write", () => {
        for (const name of ["a:b", "what?", "a*", 'say "hi"', "<b>", "a|b", "a\tb", "CON", "aux.json", "com1", "LPT9.txt"]) {
            assert.equal(FileManager.isSafeFilename(name), false, name);
        }
    });
});

describe("FileManager.isExampleFile", () => {
    it("only matches names starting with example", () => {
        for (const name of ["example.json", "Example_ping.json", " example"]) {
            assert.equal(FileManager.isExampleFile(name), true, name);
        }
        for (const name of ["ping.json", "counterexample.json", "my_example.json"]) {
            assert.equal(FileManager.isExampleFile(name), false, name);
        }
    });
});

describe("FileManager.toSafeFilename", () => {
    it("keeps the file in its folder", () => {
        assert.equal(FileManager.toSafeFilename("Traduire l'Automaton"), "Traduire l'Automaton");
        assert.equal(FileManager.toSafeFilename("Copy / Paste"), "Copy _ Paste");
        assert.equal(FileManager.toSafeFilename('a:b*c?"d<e>f|g\\h'), "a_b_c__d_e_f_g_h");
        assert.equal(FileManager.toSafeFilename(".."), "_");
        assert.equal(FileManager.toSafeFilename("aux"), "_aux");
        assert.equal(FileManager.toSafeFilename("NUL.old"), "_NUL.old");
    });
});
