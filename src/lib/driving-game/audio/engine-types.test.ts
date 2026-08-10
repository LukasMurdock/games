import { describe, expect, it } from "vitest";
import { ENGINE_WORKLET_SOURCE } from "./engine-worklet-source";
import { ENGINE_TYPES, getEngineDefinition } from "./engine-types";

describe("registered engine definitions", () => {
  it("keeps every engine serializable and structurally complete", () => {
    for (const engine of Object.values(ENGINE_TYPES)) {
      const cloned = structuredClone(engine.synthesis);
      expect(cloned.orderTables).toHaveLength(cloned.tableCentersRpm.length);
      expect(cloned.orderTables.every((table) => table.length === 32)).toBe(true);
      expect(cloned.cylinderStrength.length).toBeGreaterThanOrEqual(4);
      expect(cloned.idleRpm).toBeLessThan(cloned.limiterRpm);
      expect(cloned.limiterRpm).toBeLessThan(cloned.redlineRpm);
      for (const character of [engine.defaultTransmission.cruise, engine.defaultTransmission.aggressive]) {
        expect(character.rpmFloors).toHaveLength(character.ratios.length - 1);
      }
    }
  });

  it("uses one generic processor with no embedded engine identity or DNA", () => {
    expect(ENGINE_WORKLET_SOURCE).toContain("configurable-engine-order");
    expect(ENGINE_WORKLET_SOURCE).not.toContain("TurboI6");
    expect(ENGINE_WORKLET_SOURCE).not.toContain("ENGINE_DNA");
  });

  it("falls back safely to the reference-derived production engine", () => {
    expect(getEngineDefinition("unknown")).toBe(ENGINE_TYPES.turboI6);
    expect(ENGINE_TYPES.turboI6.provenance).toBe("reference-derived");
    expect(ENGINE_TYPES.naturallyAspiratedV8.provenance).toBe("procedural-prototype");
  });
});
