import React, { useEffect, useId, useRef, useState } from "react";
import {
  applyNumericKeyboardDelta,
  applyNumericScrubDelta,
  commitNumericDraft,
  formatNumericValue,
  parseNumericDraft,
  resolveNumericScrubDelta,
  type NumericFieldPolicy,
} from "../core/numericFieldMath";

export interface NumberFieldProps extends NumericFieldPolicy {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onBegin?: () => void;
  onFinish?: () => void;
  onCancel?: () => void;
  /** Optional final-value callback, useful for fields that intentionally commit only on release. */
  onCommit?: (value: number) => void;
  suffix?: string;
  disabled?: boolean;
  className?: string;
}

interface ScrubSession {
  pointerId: number;
  startX: number;
  originValue: number;
  active: boolean;
}

/**
 * Inspector-grade number control with forgiving text entry, keyboard stepping,
 * and Figma-style horizontal label scrubbing. A single edit session always
 * terminates through exactly one of `onFinish` or `onCancel`.
 */
export function NumberField({
  label,
  value,
  onChange,
  onBegin,
  onFinish,
  onCancel,
  onCommit,
  min,
  max,
  step = .1,
  precision,
  fallback,
  suffix,
  disabled = false,
  className = "",
}: NumberFieldProps) {
  const id = useId();
  const policy: NumericFieldPolicy = { min, max, step, precision, fallback: fallback ?? value };
  const [draft, setDraftState] = useState(() => formatNumericValue(value, policy));
  const [focused, setFocused] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrubLabelRef = useRef<HTMLSpanElement>(null);
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  const latestFiniteRef = useRef(Number.isFinite(value) ? value : fallback ?? 0);
  const baselineRef = useRef(value);
  const sessionActiveRef = useRef(false);
  const dirtyRef = useRef(false);
  const scrubRef = useRef<ScrubSession | null>(null);
  const callbacksRef = useRef({ onChange, onBegin, onFinish, onCancel, onCommit });
  callbacksRef.current = { onChange, onBegin, onFinish, onCancel, onCommit };
  valueRef.current = value;

  function setDraft(next: string) {
    draftRef.current = next;
    setDraftState(next);
  }

  function beginSession() {
    if (sessionActiveRef.current || disabled) return;
    sessionActiveRef.current = true;
    dirtyRef.current = false;
    baselineRef.current = valueRef.current;
    latestFiniteRef.current = Number.isFinite(valueRef.current) ? valueRef.current : fallback ?? 0;
    callbacksRef.current.onBegin?.();
  }

  function previewValue(next: number, displayPolicy: NumericFieldPolicy = policy) {
    if (!Number.isFinite(next)) return;
    latestFiniteRef.current = next;
    setDraft(formatNumericValue(next, displayPolicy));
    callbacksRef.current.onChange(next);
  }

  function finishSession() {
    if (!sessionActiveRef.current) return;
    if (!dirtyRef.current) {
      sessionActiveRef.current = false;
      callbacksRef.current.onFinish?.();
      return;
    }
    const parsed = parseNumericDraft(draftRef.current);
    if (parsed.kind === "empty" || parsed.kind === "invalid" || (parsed.kind === "partial" && parsed.value === undefined)) {
      cancelSession();
      return;
    }

    const finalValue = commitNumericDraft(draftRef.current, baselineRef.current, policy);
    sessionActiveRef.current = false;
    dirtyRef.current = false;
    if (finalValue !== latestFiniteRef.current) callbacksRef.current.onChange(finalValue);
    latestFiniteRef.current = finalValue;
    setDraft(formatNumericValue(finalValue, policy));
    callbacksRef.current.onCommit?.(finalValue);
    callbacksRef.current.onFinish?.();
  }

  function cancelSession() {
    if (!sessionActiveRef.current) return;
    sessionActiveRef.current = false;
    dirtyRef.current = false;
    latestFiniteRef.current = baselineRef.current;
    setDraft(formatNumericValue(baselineRef.current, policy));
    callbacksRef.current.onCancel?.();
  }

  useEffect(() => {
    if (!sessionActiveRef.current && !scrubRef.current && !focused) {
      latestFiniteRef.current = Number.isFinite(value) ? value : fallback ?? 0;
      setDraft(formatNumericValue(value, policy));
    }
  }, [value, min, max, step, precision, fallback, focused]);

  useEffect(() => () => {
    if (!sessionActiveRef.current) return;
    sessionActiveRef.current = false;
    callbacksRef.current.onCancel?.();
  }, []);

  useEffect(() => {
    if (!scrubbing) return;
    const handleScrubEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      const scrub = scrubRef.current;
      if (!scrub) return;
      scrubRef.current = null;
      setScrubbing(false);
      cancelSession();
      const labelElement = scrubLabelRef.current;
      if (labelElement?.hasPointerCapture(scrub.pointerId)) labelElement.releasePointerCapture(scrub.pointerId);
    };
    window.addEventListener("keydown", handleScrubEscape, true);
    return () => window.removeEventListener("keydown", handleScrubEscape, true);
  }, [scrubbing]);

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    beginSession();
    const nextDraft = event.currentTarget.value;
    setDraft(nextDraft);
    dirtyRef.current = true;
    const parsed = parseNumericDraft(nextDraft);
    const next = parsed.kind === "valid" || (parsed.kind === "partial" && parsed.value !== undefined)
      ? parsed.value
      : undefined;
    if (next !== undefined && Number.isFinite(next)) {
      latestFiniteRef.current = next;
      callbacksRef.current.onChange(next);
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      finishSession();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelSession();
      event.currentTarget.blur();
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "PageUp" && event.key !== "PageDown") return;

    event.preventDefault();
    event.stopPropagation();
    beginSession();
    dirtyRef.current = true;
    const direction = event.key === "ArrowUp" || event.key === "PageUp" ? 1 : -1;
    const pageMultiplier = event.key === "PageUp" || event.key === "PageDown" ? 10 : 1;
    const parsed = parseNumericDraft(draftRef.current);
    const parsedValue = "value" in parsed ? parsed.value : undefined;
    const current = typeof parsedValue === "number" ? parsedValue : latestFiniteRef.current;
    const next = applyNumericKeyboardDelta(current, {
      direction,
      step: step * pageMultiplier,
      min,
      max,
      precision,
      fallback: baselineRef.current,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    });
    previewValue(next, { ...policy, step: step * pageMultiplier });
  }

  function handleScrubPointerDown(event: React.PointerEvent<HTMLSpanElement>) {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const parsed = parseNumericDraft(draftRef.current);
    const parsedValue = "value" in parsed ? parsed.value : undefined;
    const originValue = typeof parsedValue === "number" ? parsedValue : latestFiniteRef.current;
    scrubRef.current = { pointerId: event.pointerId, startX: event.clientX, originValue, active: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleScrubPointerMove(event: React.PointerEvent<HTMLSpanElement>) {
    const scrub = scrubRef.current;
    if (!scrub || scrub.pointerId !== event.pointerId) return;
    const deltaPixels = event.clientX - scrub.startX;
    const input = {
      deltaPixels,
      step,
      min,
      max,
      precision,
      fallback: scrub.originValue,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    };
    const resolution = resolveNumericScrubDelta(input);
    if (!resolution.activated) return;
    event.preventDefault();
    if (!scrub.active) {
      scrub.active = true;
      setScrubbing(true);
      beginSession();
    }
    dirtyRef.current = true;
    const next = applyNumericScrubDelta(scrub.originValue, input);
    previewValue(next, { ...policy, precision: resolution.precision });
  }

  function handleScrubPointerUp(event: React.PointerEvent<HTMLSpanElement>) {
    const scrub = scrubRef.current;
    if (!scrub || scrub.pointerId !== event.pointerId) return;
    const wasActive = scrub.active;
    scrubRef.current = null;
    setScrubbing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (wasActive) {
      finishSession();
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }

  function handleScrubPointerCancel(event: React.PointerEvent<HTMLSpanElement>) {
    const scrub = scrubRef.current;
    if (!scrub || scrub.pointerId !== event.pointerId) return;
    const wasActive = scrub.active;
    scrubRef.current = null;
    setScrubbing(false);
    if (wasActive) cancelSession();
  }

  function handleScrubLostCapture(event: React.PointerEvent<HTMLSpanElement>) {
    const scrub = scrubRef.current;
    if (!scrub || scrub.pointerId !== event.pointerId) return;
    const wasActive = scrub.active;
    scrubRef.current = null;
    setScrubbing(false);
    if (wasActive) cancelSession();
  }

  const parsedDraft = parseNumericDraft(draft);
  const ariaValue = parsedDraft.kind === "valid" || (parsedDraft.kind === "partial" && parsedDraft.value !== undefined)
    ? parsedDraft.value
    : latestFiniteRef.current;
  const invalid = parsedDraft.kind === "invalid";
  const stateClass = `${focused ? "is-focused" : ""} ${scrubbing ? "is-scrubbing" : ""} ${invalid ? "is-invalid" : ""} ${disabled ? "is-disabled" : ""}`.trim();

  return (
    <label
      className={`number-field ${stateClass} ${className}`.trim()}
      data-numeric-field={label}
      htmlFor={id}
    >
      <span
        ref={scrubLabelRef}
        className="number-field-scrub-label"
        data-numeric-scrub={label}
        title="Drag to adjust · Shift coarse · Alt fine"
        onPointerDown={handleScrubPointerDown}
        onPointerMove={handleScrubPointerMove}
        onPointerUp={handleScrubPointerUp}
        onPointerCancel={handleScrubPointerCancel}
        onLostPointerCapture={handleScrubLostCapture}
      >
        {label}
      </span>
      <span className={`number-field-control ${suffix ? "has-suffix" : ""}`}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="spinbutton"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          data-numeric-input={label}
          value={draft}
          disabled={disabled}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={Number.isFinite(ariaValue) ? ariaValue : undefined}
          aria-valuetext={typeof ariaValue === "number" && Number.isFinite(ariaValue) ? `${formatNumericValue(ariaValue, policy)}${suffix ?? ""}` : undefined}
          aria-invalid={invalid || undefined}
          onFocus={() => { setFocused(true); beginSession(); }}
          onBlur={() => { setFocused(false); finishSession(); }}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          onDoubleClick={(event) => event.currentTarget.select()}
        />
        {suffix ? <i aria-hidden="true">{suffix}</i> : null}
      </span>
    </label>
  );
}

export function CommitNumberField({ onCommit, ...props }: Omit<NumberFieldProps, "onChange" | "onBegin" | "onFinish" | "onCancel" | "onCommit"> & {
  onCommit: (value: number) => void;
}) {
  const valueRef = useRef(props.value);
  valueRef.current = props.value;
  return (
    <NumberField
      {...props}
      onChange={() => undefined}
      onCommit={(next) => { if (next !== valueRef.current) onCommit(next); }}
    />
  );
}
