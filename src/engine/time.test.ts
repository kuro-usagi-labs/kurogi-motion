import { describe, expect, it } from "vitest";
import { calculateProgress, frameToTime, timeToFrame } from "./time";

describe("time utilities", () => {
  it("converts frames and milliseconds consistently", () => {
    expect(timeToFrame(1000, 30)).toBe(30);
    expect(frameToTime(30, 30)).toBe(1000);
  });

  it("clamps animation progress", () => {
    expect(calculateProgress(0, 100, 500)).toBe(0);
    expect(calculateProgress(350, 100, 500)).toBe(0.5);
    expect(calculateProgress(900, 100, 500)).toBe(1);
  });
});
