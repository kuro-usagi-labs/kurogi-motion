import React, { useMemo } from "react";
import { evaluateCounterText, evaluateTextScope, type EvaluatedUnitVisual } from "../core/evaluator";
import { buildTextAnimationLayout, textAnimationScope } from "../core/textAnimation";
import { textVerticalJustification } from "../core/textLayout";
import type { Scene, TextLayer } from "../types";
import { textPaintStyle } from "./designStyles";

export function AnimatedTextContent({ layer, scene, time }: { layer: TextLayer; scene: Scene; time: number }) {
  const displayText = evaluateCounterText(layer, time) ?? layer.text;
  const layout = useMemo(() => buildTextAnimationLayout(displayText), [displayText]);
  const scopes = useMemo(() => new Set(layer.animationActions.map(textAnimationScope)), [layer.animationActions]);
  const hasLineMotion = scopes.has("line");
  const hasWordMotion = scopes.has("word");
  const hasCharacterMotion = scopes.has("character");
  const hasUnitMotion = hasLineMotion || hasWordMotion || hasCharacterMotion;

  return (
    <TextFrame layer={layer}>
      <div style={{ ...textLayerStyle(layer), width: "100%" }}>
        {!hasUnitMotion ? displayText : layout.lines.map((line) => {
          const lineVisual = hasLineMotion
            ? evaluateTextScope(layer, scene, time, "line", line.lineIndex, layout.counts.line)
            : null;
          return (
            <span
              key={line.key}
              data-text-motion-unit="line"
              style={{
                display: "block",
                minHeight: "1em",
                ...(lineVisual ? unitVisualStyle(lineVisual, scene.width) : undefined),
              }}
            >
              {line.tokens.length ? line.tokens.map((token) => {
                if (token.kind === "space") return <React.Fragment key={token.key}>{token.text}</React.Fragment>;
                const wordVisual = hasWordMotion
                  ? evaluateTextScope(layer, scene, time, "word", token.wordIndex ?? 0, layout.counts.word)
                  : null;
                const characters = hasCharacterMotion
                  ? token.graphemes.map((grapheme) => {
                    const visual = evaluateTextScope(layer, scene, time, "character", grapheme.characterIndex, layout.counts.character);
                    return <span key={grapheme.key} data-text-motion-unit="character" style={{ display: "inline-block", whiteSpace: "pre", ...unitVisualStyle(visual, scene.width) }}>{grapheme.text}</span>;
                  })
                  : token.text;
                if (!wordVisual) return <React.Fragment key={token.key}>{characters}</React.Fragment>;
                return <span key={token.key} data-text-motion-unit="word" style={{ display: "inline-block", whiteSpace: "pre", ...unitVisualStyle(wordVisual, scene.width) }}>{characters}</span>;
              }) : "\u200b"}
            </span>
          );
        })}
      </div>
    </TextFrame>
  );
}

export function TextFrame({ layer, children }: { layer: TextLayer; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: textVerticalJustification(layer.style.verticalAlign),
      width: "100%",
      height: "100%",
      minWidth: 0,
      minHeight: 0,
      overflow: "hidden",
      boxSizing: "border-box",
    }}>
      {children}
    </div>
  );
}

export function textLayerStyle(layer: TextLayer): React.CSSProperties {
  return {
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    fontFamily: `${layer.style.fontFamily}, Inter, Arial, sans-serif`,
    fontWeight: layer.style.fontWeight,
    fontSize: layer.style.fontSize,
    lineHeight: layer.style.lineHeight,
    letterSpacing: layer.style.letterSpacing,
    textAlign: layer.style.align,
    ...textPaintStyle(layer),
    boxSizing: "border-box",
    minWidth: 0,
  };
}

function unitVisualStyle(visual: EvaluatedUnitVisual, perspective: number): React.CSSProperties {
  const filters = [
    visual.blur > 0 ? `blur(${visual.blur}px)` : "",
    visual.brightness !== 1 ? `brightness(${visual.brightness})` : "",
    visual.glow > 0 ? `drop-shadow(0 0 ${visual.glow}px rgba(139,92,246,.62))` : "",
  ].filter(Boolean).join(" ");
  return {
    opacity: visual.opacity,
    transform: `perspective(${perspective}px) translate(${visual.translateX}px, ${visual.translateY}px) rotate(${visual.rotation}deg) rotateX(${visual.rotateX}deg) rotateY(${visual.rotateY}deg) skewX(${visual.skewX}deg) scale(${visual.scaleX}, ${visual.scaleY})`,
    transformOrigin: "center",
    transformStyle: "preserve-3d",
    backfaceVisibility: "hidden",
    filter: filters || undefined,
    clipPath: visual.clipPath,
  };
}
