import assert from "node:assert/strict";
import { createServer } from "vite";

let vite;

try {
  vite = await createServer({
    appType: "custom",
    configFile: false,
    envFile: false,
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  const numeric = await vite.ssrLoadModule("/src/core/numericFieldMath.ts");

  assert.deepEqual(numeric.parseNumericDraft(""), { kind: "empty", draft: "" });
  assert.deepEqual(numeric.parseNumericDraft("   "), { kind: "empty", draft: "   " });
  for (const draft of ["-", "+", ".", ",", "-.", "-,", "+.", "+,"]) {
    assert.deepEqual(numeric.parseNumericDraft(draft), { kind: "partial", draft }, `${draft} must remain an editable intermediate state.`);
  }
  assert.deepEqual(numeric.parseNumericDraft("12."), { kind: "partial", draft: "12.", value: 12 });
  assert.deepEqual(numeric.parseNumericDraft("-12,"), { kind: "partial", draft: "-12,", value: -12 });
  assert.deepEqual(numeric.parseNumericDraft("1e"), { kind: "partial", draft: "1e" });
  assert.deepEqual(numeric.parseNumericDraft("-1.5e-"), { kind: "partial", draft: "-1.5e-" });
  assert.deepEqual(numeric.parseNumericDraft("1,5"), { kind: "valid", draft: "1,5", value: 1.5, normalizedDraft: "1.5" });
  assert.deepEqual(numeric.parseNumericDraft("-,5"), { kind: "valid", draft: "-,5", value: -0.5, normalizedDraft: "-.5" });
  assert.deepEqual(numeric.parseNumericDraft(".25"), { kind: "valid", draft: ".25", value: 0.25, normalizedDraft: ".25" });
  assert.deepEqual(numeric.parseNumericDraft("-42.75"), { kind: "valid", draft: "-42.75", value: -42.75, normalizedDraft: "-42.75" });
  assert.equal(numeric.parseNumericDraft("1e3").value, 1000);
  for (const draft of ["1,2.3", "1,2,3", "1..2", "1 2", "NaN", "Infinity", "1e999", "--2"]) {
    assert.deepEqual(numeric.parseNumericDraft(draft), { kind: "invalid", draft }, `${draft} must be rejected rather than silently misread.`);
  }

  assert.equal(numeric.precisionFromStep(1), 0);
  assert.equal(numeric.precisionFromStep(0.1), 1);
  assert.equal(numeric.precisionFromStep(0.05), 2);
  assert.equal(numeric.precisionFromStep(0.00025), 5);
  assert.equal(numeric.precisionFromStep(1e-7), 7);
  assert.equal(numeric.precisionFromStep(0.30000000000000004), 1, "A noisy computed step must still infer its human decimal precision.");
  assert.equal(numeric.precisionFromStep(0), 0, "Invalid steps fall back to one.");
  assert.equal(numeric.precisionFromStep(Number.NaN), 0);

  assert.equal(numeric.normalizeNumericValue(1.005, { step: 0.01 }), 1.01, "Positive midpoint rounding must be stable.");
  assert.equal(numeric.normalizeNumericValue(-1.005, { step: 0.01 }), -1.01, "Negative midpoint rounding must be symmetric.");
  assert.equal(numeric.normalizeNumericValue(2.3499999999999996, { step: 0.1 }), 2.3);
  assert.equal(numeric.normalizeNumericValue(12, { min: 0, max: 10 }), 10);
  assert.equal(numeric.normalizeNumericValue(-2, { min: 0, max: 10 }), 0);
  assert.equal(numeric.normalizeNumericValue(8, { min: 10, max: 0 }), 8, "Accidentally reversed bounds must remain usable.");
  assert.equal(numeric.normalizeNumericValue(Number.NaN, { fallback: 4.25, step: 0.01 }), 4.25);
  assert.equal(numeric.normalizeNumericValue(Number.POSITIVE_INFINITY, { min: 2, step: 1 }), 2);
  assert.equal(Object.is(numeric.normalizeNumericValue(-0.0001, { step: 1 }), -0), false);
  assert.equal(numeric.normalizeNumericValue(1.23456, { step: 1, precision: 3 }), 1.235);

  assert.equal(numeric.formatNumericValue(0.1 + 0.2, { step: 0.1 }), "0.3");
  assert.equal(numeric.formatNumericValue(1.2300000000000002, { step: 0.01 }), "1.23");
  assert.equal(numeric.formatNumericValue(1, { step: 0.01 }), "1");
  assert.equal(numeric.formatNumericValue(-0, { step: 0.1 }), "0");
  assert.equal(numeric.formatNumericValue(0.1, { step: 1 }), "0.1", "A fine Alt result must survive a controlled-input rerender.");
  assert.equal(numeric.formatNumericValue(1.23456, { step: 1 }), "1.2", "Display precision is bounded to one fine-interaction decimal by default.");
  assert.equal(numeric.formatNumericValue(1.23456, { step: 1, precision: 3 }), "1.235");

  assert.equal(numeric.commitNumericDraft("1,25", 9, { step: 0.01 }), 1.25);
  assert.equal(numeric.commitNumericDraft("2,", 9, { step: 0.1 }), 2, "A trailing decimal separator commits its finite candidate.");
  assert.equal(numeric.commitNumericDraft("-", 3.2, { step: 0.1 }), 3.2);
  assert.equal(numeric.commitNumericDraft("", 3.2, { step: 0.1 }), 3.2);
  assert.equal(numeric.commitNumericDraft("1,2.3", 3.2, { step: 0.1 }), 3.2);
  assert.equal(numeric.commitNumericDraft("100", 3.2, { min: -10, max: 10, step: 1 }), 10);

  const key = (overrides = {}) => ({ direction: 1, step: 1, ...overrides });
  assert.deepEqual(numeric.resolveNumericKeyboardDelta(key()), { delta: 1, precision: 0, multiplier: 1 });
  assert.deepEqual(numeric.resolveNumericKeyboardDelta(key({ direction: -1 })), { delta: -1, precision: 0, multiplier: 1 });
  assert.deepEqual(numeric.resolveNumericKeyboardDelta(key({ shiftKey: true })), { delta: 10, precision: 0, multiplier: 10 });
  assert.deepEqual(numeric.resolveNumericKeyboardDelta(key({ altKey: true })), { delta: 0.1, precision: 1, multiplier: 0.1 });
  assert.deepEqual(numeric.resolveNumericKeyboardDelta(key({ shiftKey: true, altKey: true })), { delta: 1, precision: 0, multiplier: 1 });
  assert.deepEqual(numeric.resolveNumericKeyboardDelta(key({ step: 0.05, altKey: true })), { delta: 0.005, precision: 3, multiplier: 0.1 });
  assert.equal(numeric.applyNumericKeyboardDelta(9.8, key({ step: 0.1, max: 10 })), 9.9);
  assert.equal(numeric.applyNumericKeyboardDelta(10, key({ step: 0.1, max: 10 })), 10);
  assert.equal(numeric.applyNumericKeyboardDelta(0, key({ direction: -1, min: 0 })), 0);
  assert.equal(numeric.applyNumericKeyboardDelta(0, key({ altKey: true })), 0.1);

  let repeated = 0;
  for (let index = 0; index < 10; index += 1) repeated = numeric.applyNumericKeyboardDelta(repeated, key({ step: 0.1 }));
  assert.equal(repeated, 1, "Repeated fractional keyboard stepping must not accumulate floating-point tails.");

  const scrub = (overrides = {}) => ({ deltaPixels: 0, step: 1, thresholdPixels: 2, pixelsPerStep: 2, ...overrides });
  assert.deepEqual(numeric.resolveNumericScrubDelta(scrub({ deltaPixels: 1 })), { activated: false, steps: 0, delta: 0, precision: 0, multiplier: 1 });
  assert.deepEqual(numeric.resolveNumericScrubDelta(scrub({ deltaPixels: 2 })), { activated: true, steps: 1, delta: 1, precision: 0, multiplier: 1 });
  assert.deepEqual(numeric.resolveNumericScrubDelta(scrub({ deltaPixels: 5 })), { activated: true, steps: 2, delta: 2, precision: 0, multiplier: 1 });
  assert.deepEqual(numeric.resolveNumericScrubDelta(scrub({ deltaPixels: -5, step: 0.1 })), { activated: true, steps: -2, delta: -0.2, precision: 1, multiplier: 1 });
  assert.equal(numeric.resolveNumericScrubDelta(scrub({ deltaPixels: 8, shiftKey: true })).delta, 40);
  assert.equal(numeric.resolveNumericScrubDelta(scrub({ deltaPixels: 8, altKey: true })).delta, 0.4);
  assert.equal(numeric.resolveNumericScrubDelta(scrub({ deltaPixels: 8, shiftKey: true, altKey: true })).delta, 4);
  assert.equal(numeric.resolveNumericScrubDelta(scrub({ deltaPixels: Number.NaN })).activated, false);
  assert.equal(numeric.applyNumericScrubDelta(10, scrub({ deltaPixels: 6, step: 0.1 })), 10.3);
  assert.equal(numeric.applyNumericScrubDelta(9.9, scrub({ deltaPixels: 20, step: 0.1, max: 10 })), 10);
  assert.equal(numeric.applyNumericScrubDelta(4.25, scrub({ deltaPixels: 1, step: 0.01 })), 4.25, "Sub-threshold movement must preserve the pointer-down origin.");

  console.log("Numeric field audit passed: partial/localized drafts, finite commit policy, stable clamp/round/format, keyboard modifiers, and thresholded scrub math verified.");
} finally {
  if (vite) await vite.close().catch(() => undefined);
}
