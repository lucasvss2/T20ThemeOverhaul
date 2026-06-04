import { describe, it, expect, afterEach } from "vitest";
import { isActiveGM } from "@/_shared/gm";

type FakeUser = { id: string; isGM: boolean; active: boolean };

const g = globalThis as unknown as Record<string, unknown>;
const savedGame = g["game"];
afterEach(() => { g["game"] = savedGame; });

function setGame(self: { id: string; isGM: boolean }, users: FakeUser[]) {
    g["game"] = {
        user: { id: self.id, isGM: self.isGM },
        users: { contents: users },
    };
}

describe("isActiveGM", () => {
    it("returns false when the current user is not a GM", () => {
        setGame({ id: "u1", isGM: false }, [{ id: "u1", isGM: false, active: true }]);
        expect(isActiveGM()).toBe(false);
    });

    it("returns true for the sole active GM", () => {
        setGame({ id: "gmB", isGM: true }, [{ id: "gmB", isGM: true, active: true }]);
        expect(isActiveGM()).toBe(true);
    });

    it("elects the lexicographically smallest active GM id", () => {
        const users: FakeUser[] = [
            { id: "gmZ", isGM: true, active: true },
            { id: "gmA", isGM: true, active: true },
        ];
        setGame({ id: "gmA", isGM: true }, users);
        expect(isActiveGM()).toBe(true);
        setGame({ id: "gmZ", isGM: true }, users);
        expect(isActiveGM()).toBe(false);
    });

    it("ignores inactive GMs when electing", () => {
        const users: FakeUser[] = [
            { id: "gmA", isGM: true, active: false }, // smaller id but offline
            { id: "gmB", isGM: true, active: true },
        ];
        setGame({ id: "gmB", isGM: true }, users);
        expect(isActiveGM()).toBe(true);
    });

    it("ignores non-GM users when electing", () => {
        const users: FakeUser[] = [
            { id: "aaa", isGM: false, active: true }, // smallest id but a player
            { id: "gmB", isGM: true, active: true },
        ];
        setGame({ id: "gmB", isGM: true }, users);
        expect(isActiveGM()).toBe(true);
    });

    it("returns false when game.user is null", () => {
        g["game"] = { user: null, users: { contents: [] } };
        expect(isActiveGM()).toBe(false);
    });
});
