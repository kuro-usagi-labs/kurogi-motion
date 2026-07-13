import { describe, expect, it } from "vitest";
import { applyEasing, easingRegistry } from "./easing";

const names = Object.keys(easingRegistry) as Array<keyof typeof easingRegistry>;

describe("easing engine", () => {
  it.each(names)("%s returns finite values", (name) => {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      expect(Number.isFinite(applyEasing(name, progress))).toBe(true);
    }
  });

  it("clamps progress before evaluation", () => {
    expect(applyEasing("linear", -1)).toBe(0);
    expect(applyEasing("linear", 2)).toBe(1);
  });

  it("keeps exact endpoints for the core easing set", () => {
    for (const name of names) {
      expect(applyEasing(name, 0)).toBeCloseTo(0, 6);
      expect(applyEasing(name, 1)).toBeCloseTo(1, 6);
    }
  });
});
