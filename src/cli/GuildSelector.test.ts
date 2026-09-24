import {beforeEach, describe, it, mock} from "node:test";
import assert from "node:assert/strict";
import {GuildSelector} from "./GuildSelector";

beforeEach(() => {
    mock.method(console, "log", () => {});
    mock.method(console, "clear", () => {});
    mock.method(console, "table", () => {});
});

describe("GuildSelector.list", () => {
    it("fetches every page of guilds", async () => {
        const all = Array.from({length: 450}, (_, i) => ({id: String(1000 + i), name: `Guild ${i}`}));
        const queries: string[] = [];
        const manager = new GuildSelector("token");
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

describe("GuildSelector.chooseGuild", () => {
    it("only accepts an integer index", async () => {
        const guilds = [{id: "1", name: "A"}, {id: "2", name: "B"}];
        const answers = ["1.5", "-0", "0x1", "2", " 1 "];
        const selector = new GuildSelector("token");
        (selector as any).fetchAllGuilds = async () => guilds;
        (selector as any).input.ask = async () => answers.shift();

        assert.equal(await selector.chooseGuild(), guilds[1]);
        assert.deepEqual(answers, []);
    });
});
