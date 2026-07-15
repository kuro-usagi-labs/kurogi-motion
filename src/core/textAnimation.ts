import type {
  AnimationAction,
  AnimationType,
  StaggerOrder,
  TextAnimationUnit,
} from "../types";

export interface TextAnimationGrapheme {
  key: string;
  text: string;
  characterIndex: number;
}

export interface TextAnimationToken {
  key: string;
  kind: "word" | "space";
  text: string;
  wordIndex?: number;
  graphemes: TextAnimationGrapheme[];
}

export interface TextAnimationLine {
  key: string;
  text: string;
  lineIndex: number;
  tokens: TextAnimationToken[];
}

export interface TextAnimationLayout {
  lines: TextAnimationLine[];
  counts: Record<TextAnimationUnit, number>;
}

type TextTimingAction = Pick<AnimationAction, "duration" | "stagger">;

const UNITS = new Set<TextAnimationUnit>(["layer", "line", "word", "character"]);
const ORDERS = new Set<StaggerOrder>(["normal", "reverse", "center", "edges", "random"]);

export function buildTextAnimationLayout(text: string): TextAnimationLayout {
  let characterIndex = 0;
  let wordIndex = 0;
  const rawLines = text.replace(/\r/g, "").split("\n");
  const lines = rawLines.map((line, lineIndex): TextAnimationLine => {
    const graphemes = segmentGraphemes(line);
    const tokens: TextAnimationToken[] = [];
    let word: TextAnimationGrapheme[] = [];
    let spaces: string[] = [];

    const flushWord = () => {
      if (!word.length) return;
      const text = word.map((part) => part.text).join("");
      tokens.push({ key: `line-${lineIndex}-word-${wordIndex}`, kind: "word", text, wordIndex, graphemes: word });
      wordIndex += 1;
      word = [];
    };
    const flushSpaces = () => {
      if (!spaces.length) return;
      const text = spaces.join("");
      tokens.push({ key: `line-${lineIndex}-space-${tokens.length}`, kind: "space", text, graphemes: [] });
      spaces = [];
    };

    for (const grapheme of graphemes) {
      if (/^\s+$/u.test(grapheme)) {
        flushWord();
        spaces.push(grapheme);
      } else {
        flushSpaces();
        word.push({ key: `character-${characterIndex}`, text: grapheme, characterIndex });
        characterIndex += 1;
      }
    }
    flushWord();
    flushSpaces();
    return { key: `line-${lineIndex}`, text: line, lineIndex, tokens };
  });

  return {
    lines,
    counts: {
      layer: 1,
      line: lines.length,
      word: wordIndex,
      character: characterIndex,
    },
  };
}

export function segmentGraphemes(text: string): string[] {
  const Segmenter = (Intl as typeof Intl & {
    Segmenter?: new (
      locale?: string | string[],
      options?: { granularity: "grapheme" },
    ) => { segment: (value: string) => Iterable<{ segment: string }> };
  }).Segmenter;
  if (!Segmenter) return Array.from(text);
  return Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(text), (part) => part.segment);
}

export function textAnimationScope(action: Pick<AnimationAction, "type" | "stagger">): TextAnimationUnit {
  if (!supportsTextAnimationUnit(action.type)) return "layer";
  return action.stagger?.enabled && action.stagger.unit !== "layer" ? action.stagger.unit : "layer";
}

export function textAnimationScopeLabel(unit: TextAnimationUnit, count?: number) {
  const plural = count === 1 ? "" : "s";
  if (unit === "character") return `letter${plural}`;
  if (unit === "word") return `word${plural}`;
  if (unit === "line") return `line${plural}`;
  return "whole text";
}

export function textAnimationScopeBadge(unit: TextAnimationUnit) {
  if (unit === "character") return "CHAR";
  if (unit === "word") return "WORD";
  if (unit === "line") return "LINE";
  return "WHOLE";
}

export function supportsTextAnimationUnit(type: AnimationType) {
  return type !== "counter";
}

export function defaultTextStaggerDelay(unit: TextAnimationUnit) {
  if (unit === "character") return .035;
  if (unit === "word") return .08;
  if (unit === "line") return .12;
  return 0;
}

export function withTextAnimationScope(action: AnimationAction, unit: TextAnimationUnit): AnimationAction {
  if (unit === "layer" || !supportsTextAnimationUnit(action.type)) return { ...action, stagger: undefined };
  return {
    ...action,
    stagger: textStaggerForScope(unit, action.stagger),
  };
}

export function textStaggerForScope(unit: TextAnimationUnit, current?: AnimationAction["stagger"]): AnimationAction["stagger"] {
  if (unit === "layer") return undefined;
  return {
    enabled: true,
    unit,
    delay: current?.enabled ? current.delay : defaultTextStaggerDelay(unit),
    order: current?.order ?? "normal",
    seed: current?.seed ?? 42,
  };
}

export function normalizeTextStagger(value: unknown, type?: AnimationType): AnimationAction["stagger"] {
  if (!supportsTextAnimationUnit(type ?? "fadeIn") || !value || typeof value !== "object") return undefined;
  const candidate = value as Partial<NonNullable<AnimationAction["stagger"]>>;
  if (candidate.enabled !== true) return undefined;
  const unit = UNITS.has(candidate.unit as TextAnimationUnit) ? candidate.unit as TextAnimationUnit : "character";
  if (unit === "layer") return undefined;
  const order = ORDERS.has(candidate.order as StaggerOrder) ? candidate.order as StaggerOrder : "normal";
  const rawDelay = Number(candidate.delay);
  const rawSeed = Number(candidate.seed);
  return {
    enabled: true,
    unit,
    delay: Number.isFinite(rawDelay) ? clamp(rawDelay, 0, 10) : defaultTextStaggerDelay(unit),
    order,
    seed: Number.isFinite(rawSeed) ? Math.round(rawSeed) : 42,
  };
}

export function textAnimationUnitCount(text: string, unit: TextAnimationUnit) {
  return buildTextAnimationLayout(text).counts[unit];
}

export function textAnimationStaggerRank(index: number, count: number, order: StaggerOrder, seed = 1) {
  if (count <= 1) return 0;
  if (order === "reverse") return Math.max(0, count - index - 1);
  if (order === "center") {
    const raw = Math.abs(index - (count - 1) / 2);
    return raw - (count % 2 === 0 ? .5 : 0);
  }
  if (order === "edges") return Math.min(index, count - index - 1);
  if (order === "random") {
    const ranks = Array.from({ length: count }, (_, value) => value);
    ranks.sort((a, b) => seededRandom(seed + a * 101) - seededRandom(seed + b * 101) || a - b);
    return ranks.indexOf(index);
  }
  return Math.max(0, index);
}

export function textAnimationStaggerSpread(action: TextTimingAction, text: string) {
  const stagger = action.stagger;
  if (!stagger?.enabled || stagger.unit === "layer" || stagger.delay <= 0) return 0;
  const count = textAnimationUnitCount(text, stagger.unit);
  let maximumRank = 0;
  for (let index = 0; index < count; index += 1) {
    maximumRank = Math.max(maximumRank, textAnimationStaggerRank(index, count, stagger.order, stagger.seed ?? 1));
  }
  return maximumRank * stagger.delay;
}

export function textAnimationVisualDuration(action: TextTimingAction, text: string) {
  return Math.max(.05, finite(action.duration, .05)) + textAnimationStaggerSpread(action, text);
}

export function textAnimationVisualEnd(
  action: Pick<AnimationAction, "startTime" | "delay" | "duration" | "stagger">,
  text: string,
) {
  return Math.max(0, finite(action.startTime, 0))
    + Math.max(0, finite(action.delay, 0))
    + textAnimationVisualDuration(action, text);
}

function seededRandom(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
