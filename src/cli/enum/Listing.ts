export enum Listing {
    ALL,
    DEPLOYED,
    LOCAL,
    ADDABLE, // Guild files not deployed in the guild yet
}

// Scope of listFromFile for guild interactions, whatever their guild
export const ALL_GUILDS = Symbol("all guilds");
