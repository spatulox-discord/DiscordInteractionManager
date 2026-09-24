// The session token comes in the URL printed by "dim web", and is kept for the reloads of this tab
const TOKEN_KEY = "dim-token";
const fromUrl = new URLSearchParams(location.hash.slice(1)).get("token");
if (fromUrl) {
    sessionStorage.setItem(TOKEN_KEY, fromUrl);
    history.replaceState(null, "", location.pathname);
}
const token = sessionStorage.getItem(TOKEN_KEY) ?? "";

const listeners = [];

// Called with the messages of every answer (info, warn, error), and the error of a failed request
export function onMessages(listener) {
    listeners.push(listener);
}

export class ApiError extends Error {
    constructor(status, data) {
        super(data?.error ?? `HTTP ${status}`);
        this.status = status;
        this.data = data ?? {};
    }
}

export async function api(method, path, body) {
    let response;
    try {
        response = await fetch(`/api/${path}`, {
            method,
            headers: {"X-DIM-Token": token, ...(body === undefined ? {} : {"Content-Type": "application/json"})},
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        const error = new ApiError(0, {error: "The server does not answer: is \"dim web\" still running?"});
        listeners.forEach(listener => listener([], error));
        throw error;
    }

    const data = await response.json().catch(() => ({}));
    const error = response.ok ? null : new ApiError(response.status, data);
    listeners.forEach(listener => listener(data.messages ?? [], error));
    if (error) throw error;
    return data.data;
}

export const hasToken = () => token !== "";
