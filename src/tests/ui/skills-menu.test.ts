import { describe, expect, it } from "vitest";

import { stripPackLabelPrefix } from "@/ui/skills-menu";

describe("stripPackLabelPrefix", () => {
    it("remove o prefixo redundante do módulo", () => {
        expect(stripPackLabelPrefix("T20 Overhaul — Ameaças")).toBe("Ameaças");
        expect(stripPackLabelPrefix("T20 Overhaul — Cruzado (Clérigo Variante)")).toBe("Cruzado (Clérigo Variante)");
    });

    it("mantém labels sem o prefixo intactos", () => {
        expect(stripPackLabelPrefix("Ameaças")).toBe("Ameaças");
    });
});
