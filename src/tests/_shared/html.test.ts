import { describe, it, expect } from "vitest";
import { escHtml } from "@/_shared/html";

describe("escHtml", () => {
    it("escapes ampersands", () => {
        expect(escHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
    });
    it("escapes angle brackets", () => {
        expect(escHtml("<script>")).toBe("&lt;script&gt;");
    });
    it("escapes & before < and > (no double-escaping of entities)", () => {
        // & is replaced first, so a raw < becomes &lt; — not &amp;lt;
        expect(escHtml("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
    });
    it("leaves quotes and apostrophes untouched (text-context only)", () => {
        expect(escHtml(`"x" 'y'`)).toBe(`"x" 'y'`);
    });
    it("returns an empty string unchanged", () => {
        expect(escHtml("")).toBe("");
    });
});
