export interface SidebarSelectionInput {
  visibleLayerIds: string[];
  selectedLayerIds: string[];
  clickedLayerId: string;
  anchorLayerId: string;
  toggle: boolean;
  range: boolean;
  additiveRange?: boolean;
}

export interface SidebarSelectionResult {
  selectedLayerIds: string[];
  primaryLayerId: string;
  anchorLayerId: string;
}

/**
 * Resolve desktop-style list selection without depending on React state.
 * The visible order is supplied by the caller so Shift selection always
 * matches what the user actually sees in the Layers panel.
 */
export function resolveSidebarSelection(input: SidebarSelectionInput): SidebarSelectionResult {
  const visibleLayerIds = unique(input.visibleLayerIds);
  if (!visibleLayerIds.includes(input.clickedLayerId)) {
    return {
      selectedLayerIds: input.selectedLayerIds,
      primaryLayerId: input.selectedLayerIds.at(-1) ?? "",
      anchorLayerId: input.anchorLayerId,
    };
  }

  const current = unique(input.selectedLayerIds).filter((id) => visibleLayerIds.includes(id));
  if (input.range) {
    const clickedIndex = visibleLayerIds.indexOf(input.clickedLayerId);
    const anchorIndex = visibleLayerIds.indexOf(input.anchorLayerId);
    const effectiveAnchorIndex = anchorIndex >= 0 ? anchorIndex : clickedIndex;
    const start = Math.min(clickedIndex, effectiveAnchorIndex);
    const end = Math.max(clickedIndex, effectiveAnchorIndex);
    const rangeIds = visibleLayerIds.slice(start, end + 1);
    const selectedLayerIds = input.additiveRange
      ? visibleLayerIds.filter((id) => current.includes(id) || rangeIds.includes(id))
      : rangeIds;
    return {
      selectedLayerIds,
      primaryLayerId: input.clickedLayerId,
      // Shift repeatedly extends from the original anchor, like a desktop list.
      anchorLayerId: anchorIndex >= 0 ? input.anchorLayerId : input.clickedLayerId,
    };
  }

  if (input.toggle) {
    const selectedLayerIds = current.includes(input.clickedLayerId)
      ? current.filter((id) => id !== input.clickedLayerId)
      : [...current, input.clickedLayerId];
    return {
      selectedLayerIds,
      primaryLayerId: selectedLayerIds.includes(input.clickedLayerId)
        ? input.clickedLayerId
        : selectedLayerIds.at(-1) ?? "",
      anchorLayerId: input.clickedLayerId,
    };
  }

  return {
    selectedLayerIds: [input.clickedLayerId],
    primaryLayerId: input.clickedLayerId,
    anchorLayerId: input.clickedLayerId,
  };
}

export function selectionAfterMarquee(
  visibleLayerIds: string[],
  hitLayerIds: string[],
  baselineLayerIds: string[],
  additive: boolean,
) {
  const hits = new Set(hitLayerIds);
  const baseline = new Set(baselineLayerIds);
  return unique(visibleLayerIds).filter((id) => hits.has(id) || (additive && baseline.has(id)));
}

function unique(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}
