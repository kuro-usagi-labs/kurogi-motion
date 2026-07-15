/**
 * Pure numeric-field policy shared by Inspector controls and focused audits.
 *
 * `step` defines the normal increment and its decimal precision. Shift makes an
 * interaction ten times coarser, Alt makes it ten times finer, and using both
 * modifiers composes back to the normal increment.
 */

export const MAX_NUMERIC_PRECISION = 12;
export const DEFAULT_NUMERIC_STEP = 1;
export const DEFAULT_SCRUB_THRESHOLD_PX = 2;
export const DEFAULT_SCRUB_PIXELS_PER_STEP = 2;

export interface NumericFieldPolicy {
  min?: number;
  max?: number;
  step?: number;
  /** Explicit decimal precision. When omitted it is derived from `step`. */
  precision?: number;
  /** Used when the supplied value or committed draft is not finite. */
  fallback?: number;
}

export interface NumericModifiers {
  shiftKey?: boolean;
  altKey?: boolean;
}

export type NumericDraftParse =
  | { kind: "empty"; draft: string }
  | { kind: "partial"; draft: string; value?: number }
  | { kind: "valid"; draft: string; value: number; normalizedDraft: string }
  | { kind: "invalid"; draft: string };

export interface NumericKeyboardDeltaInput extends NumericFieldPolicy, NumericModifiers {
  direction: -1 | 1;
}

export interface NumericDeltaResolution {
  delta: number;
  precision: number;
  multiplier: number;
}

export interface NumericScrubDeltaInput extends NumericFieldPolicy, NumericModifiers {
  /** Total horizontal distance from pointer-down, not the previous pointer event. */
  deltaPixels: number;
  /** Distance required before the gesture owns the pointer. Defaults to 2 px. */
  thresholdPixels?: number;
  /** Horizontal pixels representing one logical step. Defaults to 2 px. */
  pixelsPerStep?: number;
}

export interface NumericScrubResolution extends NumericDeltaResolution {
  activated: boolean;
  /** Signed count of logical steps represented by the total pointer distance. */
  steps: number;
}

const COMPLETE_NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const TRAILING_SEPARATOR = /^[+-]?\d+\.$/;
const INCOMPLETE_EXPONENT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?$/;
const BARE_PREFIX = /^[+-]?(?:\.)?$/;

/**
 * Parses an editable draft without collapsing useful intermediate states.
 * A single comma is accepted as a decimal separator; mixed dot/comma drafts
 * and repeated commas are deliberately rejected as ambiguous.
 */
export function parseNumericDraft(draft: string): NumericDraftParse {
  const trimmed = draft.trim();
  if (!trimmed) return { kind: "empty", draft };

  const commaCount = countCharacter(trimmed, ",");
  if ((commaCount > 0 && trimmed.includes(".")) || commaCount > 1) return { kind: "invalid", draft };
  const normalizedDraft = commaCount === 1 ? trimmed.replace(",", ".") : trimmed;

  if (BARE_PREFIX.test(normalizedDraft)) return { kind: "partial", draft };
  if (TRAILING_SEPARATOR.test(normalizedDraft)) {
    const value = Number(normalizedDraft.slice(0, -1));
    return Number.isFinite(value) ? { kind: "partial", draft, value: normalizeNegativeZero(value) } : { kind: "invalid", draft };
  }
  if (INCOMPLETE_EXPONENT.test(normalizedDraft)) return { kind: "partial", draft };
  if (!COMPLETE_NUMBER.test(normalizedDraft)) return { kind: "invalid", draft };

  const value = Number(normalizedDraft);
  if (!Number.isFinite(value)) return { kind: "invalid", draft };
  return { kind: "valid", draft, value: normalizeNegativeZero(value), normalizedDraft };
}

/** Returns the smallest stable decimal precision needed to express a step. */
export function precisionFromStep(step = DEFAULT_NUMERIC_STEP): number {
  const safeStep = sanitizeStep(step);
  for (let precision = 0; precision <= MAX_NUMERIC_PRECISION; precision += 1) {
    const scaled = safeStep * 10 ** precision;
    const tolerance = Math.max(1, Math.abs(scaled)) * 1e-10;
    if (Math.abs(scaled - Math.round(scaled)) <= tolerance) return precision;
  }
  return MAX_NUMERIC_PRECISION;
}

/** Rounds to the policy precision, clamps to finite bounds, and never returns NaN/Infinity/-0. */
export function normalizeNumericValue(value: number, policy: NumericFieldPolicy = {}): number {
  const bounds = resolveBounds(policy.min, policy.max);
  const fallback = resolveFallback(policy.fallback, bounds);
  const candidate = Number.isFinite(value) ? value : fallback;
  const precision = resolvePolicyPrecision(policy);
  const rounded = roundToPrecision(candidate, precision);
  return normalizeNegativeZero(clampToBounds(rounded, bounds));
}

/**
 * Formats a finite external value without floating-point tails or padded zeroes.
 * One finer decimal than `step` is preserved by default so an Alt-fine keyboard
 * result remains visible after React re-renders the controlled input.
 */
export function formatNumericValue(value: number, policy: NumericFieldPolicy = {}): string {
  const bounds = resolveBounds(policy.min, policy.max);
  const fallback = resolveFallback(policy.fallback, bounds);
  const finiteValue = clampToBounds(Number.isFinite(value) ? value : fallback, bounds);
  const basePrecision = resolvePolicyPrecision(policy);
  const precision = policy.precision === undefined
    ? Math.max(basePrecision, Math.min(basePrecision + 1, stableValuePrecision(finiteValue)))
    : basePrecision;
  const rounded = roundToPrecision(finiteValue, precision);
  if (!Number.isFinite(rounded) || Object.is(rounded, -0)) return "0";
  return rounded.toFixed(precision).replace(/(?:\.0+|(?:(\.\d*?[1-9]))0+)$/, "$1");
}

/** Commits a valid draft, accepts a trailing separator candidate, or restores the previous value. */
export function commitNumericDraft(draft: string, previousValue: number, policy: NumericFieldPolicy = {}): number {
  const parsed = parseNumericDraft(draft);
  if (parsed.kind === "valid") return normalizeNumericValue(parsed.value, policy);
  if (parsed.kind === "partial" && parsed.value !== undefined) return normalizeNumericValue(parsed.value, policy);
  return normalizeNumericValue(previousValue, policy);
}

/** Resolves ArrowUp/ArrowDown delta without reading browser state. */
export function resolveNumericKeyboardDelta(input: NumericKeyboardDeltaInput): NumericDeltaResolution {
  const baseStep = sanitizeStep(input.step);
  const multiplier = modifierMultiplier(input);
  const adjustedStep = baseStep * multiplier;
  const precision = Math.max(resolveExplicitPrecision(input.precision) ?? 0, precisionFromStep(adjustedStep));
  return {
    delta: roundToPrecision(adjustedStep * input.direction, precision),
    precision,
    multiplier,
  };
}

/** Applies one keyboard step and normalizes the result using the effective modifier precision. */
export function applyNumericKeyboardDelta(value: number, input: NumericKeyboardDeltaInput): number {
  const resolution = resolveNumericKeyboardDelta(input);
  return normalizeNumericValue(value + resolution.delta, { ...input, precision: resolution.precision });
}

/**
 * Converts total horizontal pointer movement to deterministic, discrete steps.
 * The drag threshold prevents accidental clicks; pixel sensitivity controls how
 * quickly subsequent horizontal movement advances logical field steps.
 */
export function resolveNumericScrubDelta(input: NumericScrubDeltaInput): NumericScrubResolution {
  const deltaPixels = Number.isFinite(input.deltaPixels) ? input.deltaPixels : 0;
  const threshold = sanitizeNonNegative(input.thresholdPixels, DEFAULT_SCRUB_THRESHOLD_PX);
  const pixelsPerStep = sanitizePositive(input.pixelsPerStep, DEFAULT_SCRUB_PIXELS_PER_STEP);
  const activated = deltaPixels !== 0 && Math.abs(deltaPixels) >= threshold;
  const steps = activated ? Math.trunc(deltaPixels / pixelsPerStep) : 0;
  const baseStep = sanitizeStep(input.step);
  const multiplier = modifierMultiplier(input);
  const adjustedStep = baseStep * multiplier;
  const precision = Math.max(resolveExplicitPrecision(input.precision) ?? 0, precisionFromStep(adjustedStep));
  return {
    activated,
    steps,
    delta: roundToPrecision(steps * adjustedStep, precision),
    precision,
    multiplier,
  };
}

/** Applies a scrub computed from its pointer-down origin, avoiding cumulative drift. */
export function applyNumericScrubDelta(originValue: number, input: NumericScrubDeltaInput): number {
  const resolution = resolveNumericScrubDelta(input);
  if (!resolution.activated || resolution.steps === 0) return normalizeNumericValue(originValue, { ...input, precision: resolution.precision });
  return normalizeNumericValue(originValue + resolution.delta, { ...input, precision: resolution.precision });
}

function sanitizeStep(step: number | undefined): number {
  return Number.isFinite(step) && Number(step) > 0 ? Number(step) : DEFAULT_NUMERIC_STEP;
}

function modifierMultiplier(modifiers: NumericModifiers): number {
  return (modifiers.shiftKey ? 10 : 1) * (modifiers.altKey ? 0.1 : 1);
}

function resolvePolicyPrecision(policy: NumericFieldPolicy): number {
  return resolveExplicitPrecision(policy.precision) ?? precisionFromStep(policy.step);
}

function resolveExplicitPrecision(precision: number | undefined): number | undefined {
  if (!Number.isFinite(precision)) return undefined;
  return Math.min(MAX_NUMERIC_PRECISION, Math.max(0, Math.trunc(Number(precision))));
}

function stableValuePrecision(value: number): number {
  const absolute = Math.abs(value);
  for (let precision = 0; precision <= MAX_NUMERIC_PRECISION; precision += 1) {
    const rounded = roundToPrecision(absolute, precision);
    const tolerance = Math.max(1, absolute) * Number.EPSILON * 16;
    if (Math.abs(absolute - rounded) <= tolerance) return precision;
  }
  return MAX_NUMERIC_PRECISION;
}

function roundToPrecision(value: number, precision: number): number {
  if (!Number.isFinite(value)) return value;
  if (precision <= 0) return normalizeNegativeZero(Math.sign(value) * Math.round(Math.abs(value)));
  const [coefficient, exponentText = "0"] = Math.abs(value).toString().split("e");
  const shifted = Number(`${coefficient}e${Number(exponentText) + precision}`);
  if (!Number.isFinite(shifted)) return value;
  const rounded = Math.round(shifted);
  return normalizeNegativeZero(Math.sign(value) * Number(`${rounded}e${-precision}`));
}

interface NumericBounds {
  lower: number;
  upper: number;
}

function resolveBounds(min: number | undefined, max: number | undefined): NumericBounds {
  const finiteMin = Number.isFinite(min) ? Number(min) : Number.NEGATIVE_INFINITY;
  const finiteMax = Number.isFinite(max) ? Number(max) : Number.POSITIVE_INFINITY;
  return finiteMin <= finiteMax
    ? { lower: finiteMin, upper: finiteMax }
    : { lower: finiteMax, upper: finiteMin };
}

function resolveFallback(fallback: number | undefined, bounds: NumericBounds): number {
  if (Number.isFinite(fallback)) return clampToBounds(Number(fallback), bounds);
  if (bounds.lower !== Number.NEGATIVE_INFINITY) return bounds.lower;
  if (bounds.upper !== Number.POSITIVE_INFINITY) return bounds.upper;
  return 0;
}

function clampToBounds(value: number, bounds: NumericBounds): number {
  return Math.min(bounds.upper, Math.max(bounds.lower, value));
}

function sanitizeNonNegative(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : fallback;
}

function sanitizePositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function countCharacter(value: string, character: string): number {
  let count = 0;
  for (const current of value) if (current === character) count += 1;
  return count;
}
