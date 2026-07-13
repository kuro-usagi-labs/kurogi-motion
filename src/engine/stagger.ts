import type { StaggerDocument } from "../domain/project";

const mulberry32 = (seed: number): (() => number) => {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

export const createStaggerOrder = (
  unitCount: number,
  stagger: StaggerDocument,
): number[] => {
  const indexes = Array.from({ length: Math.max(0, unitCount) }, (_, index) => index);
  switch (stagger.order) {
    case "reverse":
      return indexes.reverse();
    case "center-out": {
      const center = (unitCount - 1) / 2;
      return indexes.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
    }
    case "edges-in": {
      const center = (unitCount - 1) / 2;
      return indexes.sort((a, b) => Math.abs(b - center) - Math.abs(a - center));
    }
    case "random": {
      const random = mulberry32(stagger.seed);
      for (let index = indexes.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
      }
      return indexes;
    }
    default:
      return indexes;
  }
};

export const getStaggerDelay = (
  unitIndex: number,
  unitCount: number,
  stagger: StaggerDocument,
): number => {
  if (!stagger.enabled || unitCount <= 1) return 0;
  const order = createStaggerOrder(unitCount, stagger);
  const orderIndex = order.indexOf(unitIndex);
  return Math.max(0, orderIndex) * stagger.delayMs;
};
