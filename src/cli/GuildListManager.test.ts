import {beforeEach, describe, it, mock} from "node:test";
import assert from "node:assert/strict";
import {GuildListManager} from "./GuildListManager";

beforeEach(() => {
    mock.method(console, "log", () => {});
    mock.method(console, "clear", () => {});
    mock.method(console, "table", () => {});
});

describe("GuildListManager.list", () => {
    it("fetches every page of guilds", async () => {
        const all = Array.from({length: 450}, (_, i) => ({id: String(1000 + i), name: `Guild ${i}`}));
        const queries: string[] = [];
        const manager = new GuildListManager("123456789012345678", "token");
        (manager as any).rest = {
            get: async (_route: string, options: { query: URLSearchParams }) => {
                queries.push(options.query.toString());
                const after = options.query.get("after");
                const start = after ? all.findIndex(g => g.id === after) + 1 : 0;
                return all.slice(start, start + Number(options.query.get("limit")));
            },
        };

        const guilds = await manager.list(false);

        assert.equal(guilds.length, 450);
        assert.deepEqual(queries, ["limit=200", "limit=200&after=1199", "limit=200&after=1399"]);
    });
});
