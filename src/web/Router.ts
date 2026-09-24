import {IncomingMessage, ServerResponse} from "node:http";

export class HttpError extends Error {
    constructor(readonly status: number, message: string, readonly details?: Record<string, unknown>) {
        super(message);
    }
}

export type RouteContext = {
    params: Record<string, string>;
    query: URLSearchParams;
    body: unknown;
};
export type RouteHandler = (context: RouteContext) => Promise<unknown>;

type Route = { method: string, pattern: RegExp, keys: string[], handler: RouteHandler };

/**
 * Routes such as "/api/:kind/files/:filename", each parameter matching one path segment.
 */
export class Router {
    private readonly routes: Route[] = [];

    add(method: string, path: string, handler: RouteHandler): this {
        const keys: string[] = [];
        const source = path.split("/").map(segment => {
            if (!segment.startsWith(":")) return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            keys.push(segment.slice(1));
            return "([^/]+)";
        }).join("/");
        this.routes.push({method, pattern: new RegExp(`^${source}$`), keys, handler});
        return this;
    }

    /**
     * @returns null when no route has this path, or a 405 error when none has this method
     */
    match(method: string, pathname: string): { handler: RouteHandler, params: Record<string, string> } | null {
        let pathFound = false;
        for (const route of this.routes) {
            const match = route.pattern.exec(pathname);
            if (!match) continue;
            pathFound = true;
            if (route.method !== method) continue;
            try {
                const params = Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1]!)]));
                return {handler: route.handler, params};
            } catch {
                throw new HttpError(400, `Invalid URL ${pathname}`);
            }
        }
        if (pathFound) throw new HttpError(405, `${method} is not allowed on ${pathname}`);
        return null;
    }
}

export async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > maxBytes) throw new HttpError(413, `The body is larger than ${maxBytes} bytes`);
        chunks.push(chunk as Buffer);
    }
    if (size === 0) return undefined;
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        throw new HttpError(400, "The body is not valid JSON");
    }
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
    const body = JSON.stringify(data);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store",
    });
    res.end(body);
}
