import { describe, expect, it } from "vitest";
import type { StaggerDocument } from "../domain/project";
import { createStaggerOrder, getStaggerDelay } from "./stagger";

const stagger = (order: StaggerDocument["order"], seed = 42): StaggerDocument => ({
  enabled: true,
  unit: "character",
  delayMs: 60,
  order,
  seed,
});

describe("seeded stagger", () => {
  it("creates deterministic random orders", () => {
    expect(createStaggerOrder(10, stagger("random", 99))).toEqual(
      createStaggerOrder(10, stagger("random", 99)),
    );
  });

  it("changes random order when the seed changes", () => {
    expect(createStaggerOrder(10, stagger("random", 1))).not.toEqual(
      createStaggerOrder(10, stagger("random", 2)),
    );
  });

  it("calculates delay from the resolved order", () => {
    expect(getStaggerDelay(0, 4, stagger("forward"))).toBe(0);
    expect(getStaggerDelay(3, 4, stagger("forward"))).toBe(180);
  });
});
