import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openBrowser } from "@remotion/renderer";
import { createServer } from "vite";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = path.join(repositoryRoot, "artifacts", "headless-editor-ui");
const viewport = { width: 1560, height: 980, deviceScaleFactor: 1 };
const consoleErrors = [];
const pageErrors = [];
const observations = {};

let vite;
let browser;
let page;

try {
  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(outputDirectory, { recursive: true });

  vite = await createServer({
    root: repositoryRoot,
    appType: "spa",
    logLevel: "error",
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
      hmr: false,
      watch: null,
    },
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  assert.ok(address && typeof address === "object", "Vite did not expose a local audit port.");
  const appUrl = `http://127.0.0.1:${address.port}`;

  browser = await openBrowser("chrome", {
    chromeMode: "headless-shell",
    logLevel: "error",
    forceDeviceScaleFactor: 1,
    chromiumOptions: { darkMode: true },
  });
  page = await browser.newPage({
    context: () => null,
    logLevel: "error",
    indent: false,
    pageIndex: 0,
    onBrowserLog: (entry) => {
      if (entry.type === "error") consoleErrors.push(entry.text);
    },
    onLog: () => undefined,
  });
  page.on("error", (error) => pageErrors.push(error.message));
  page.setDefaultNavigationTimeout(30_000);
  page.setDefaultTimeout(15_000);
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument(() => {
    try { window.localStorage.clear(); } catch { /* clean profile is already isolated */ }
  });
  await page.goto({ url: appUrl, timeout: 30_000 });

  await waitFor(() => page.evaluate(() => document.readyState === "complete" && Boolean(document.querySelector(".dashboard-v3"))), "dashboard shell");
  await screenshot("01-dashboard.png");
  assert.equal(await count(".dashboard-empty-with-actions button"), 2, "The first-run empty state must offer both blank-project and template paths in context.");

  await click("button.dashboard-primary-action", "Create project");
  await waitForSelector(".create-project-dialog");
  observations.createProjectWorkflow = await auditCreateProjectWorkflow();
  await setInputValue('.create-project-dialog input:not([type])', "Headless interaction audit");
  await click(".create-project-dialog footer button.dashboard-primary-action", "Create project");
  await waitForSelector(".editor-app");
  await waitForSelector(".workspace-panel-resizer.is-sidebar");

  assert.equal(await textOf(".project-name strong"), "Headless interaction audit", "Project must be created through the visible dashboard flow.");

  await clickByText(".layer-quick-add button", "Text");
  await clickByText(".layer-quick-add button", "Shape");
  await importSvgThroughFileInput();

  await waitForSelector(".layer-thumbnail.is-text .layer-thumbnail-text");
  observations.layerRowsAfterCreate = await page.evaluate(() => Array.from(document.querySelectorAll(".layer-row")).map((row) => ({
    name: row.querySelector(".layer-name-editor")?.value ?? row.textContent?.trim(),
    kind: row.querySelector(".layer-thumbnail")?.getAttribute("data-thumbnail-kind"),
    previewMarkup: row.querySelector(".layer-thumbnail")?.innerHTML.slice(0, 180),
  })));
  await waitForSelector(".layer-thumbnail.is-shape .layer-thumbnail-shape path");
  await waitFor(() => page.evaluate(() => {
    const image = document.querySelector(".layer-thumbnail.is-svg img");
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && image.src.startsWith("blob:");
  }), "content-aware SVG thumbnail");

  observations.thumbnailKinds = await page.evaluate(() => Array.from(document.querySelectorAll(".layer-list .layer-thumbnail")).map((node) => ({
    kind: node.getAttribute("data-thumbnail-kind"),
    text: node.querySelector(".layer-thumbnail-text")?.textContent ?? "",
    hasMedia: Boolean(node.querySelector("img,video")),
    hasShape: Boolean(node.querySelector("svg.layer-thumbnail-shape path")),
  })));
  assert.ok(observations.thumbnailKinds.some((item) => item.kind === "text" && item.text.length > 0), "Text thumbnails must expose real content identity.");
  assert.ok(observations.thumbnailKinds.some((item) => item.kind === "shape" && item.hasShape), "Shape thumbnails must expose real geometry identity.");
  assert.ok(observations.thumbnailKinds.some((item) => item.kind === "svg" && item.hasMedia), "SVG thumbnails must render the imported asset source.");
  observations.effectsDisclosure = await auditEffectsDisclosure();
  observations.canvasNudge = await auditCanvasNudge();
  observations.inspectorNumericInput = await auditInspectorNumericInput();
  observations.canvasDirectResize = await auditCanvasDirectResize();
  observations.sidebarSelectionAndGrouping = await auditSidebarSelectionAndGrouping();
  observations.canvasDelete = await auditCanvasDeleteShortcut();
  await screenshot("02-content-aware-thumbnails.png");

  const sidebarBefore = await separatorValue(".workspace-panel-resizer.is-sidebar");
  await dispatchSeparatorKey(".workspace-panel-resizer.is-sidebar", "ArrowRight");
  await waitFor(async () => await separatorValue(".workspace-panel-resizer.is-sidebar") === sidebarBefore + 8, "keyboard layer-panel resize");
  const sidebarAfter = await separatorValue(".workspace-panel-resizer.is-sidebar");

  const inspectorBefore = await separatorValue(".workspace-panel-resizer.is-inspector");
  const inspectorRect = await rectOf(".workspace-panel-resizer.is-inspector");
  await dragMouse(inspectorRect.x + inspectorRect.width / 2, inspectorRect.y + inspectorRect.height / 2, inspectorRect.x - 54, inspectorRect.y + inspectorRect.height / 2);
  await waitFor(async () => await separatorValue(".workspace-panel-resizer.is-inspector") >= inspectorBefore + 45, "pointer inspector resize");
  const inspectorAfter = await separatorValue(".workspace-panel-resizer.is-inspector");
  assert.equal(await page.evaluate(() => document.body.classList.contains("workspace-panel-resizing")), false, "Pointer resize state must clear after release.");

  const storedPreferences = await page.evaluate(() => JSON.parse(window.localStorage.getItem("kurogi-editor-ui-v1") ?? "null"));
  assert.equal(storedPreferences.sidebarWidth, sidebarAfter, "Keyboard panel resize must persist.");
  assert.equal(storedPreferences.inspectorWidth, inspectorAfter, "Pointer panel resize must persist.");
  observations.panelResize = { sidebarBefore, sidebarAfter, inspectorBefore, inspectorAfter };
  await screenshot("03-panels-resized.png");

  await click(".sidebar-collapse-button");
  await waitForSelector(".editor-app.is-sidebar-hidden");
  assert.equal(await isDisplayed(".editor-sidebar"), false, "Collapsed layer panel must leave the workspace layout.");
  assert.equal(await isDisplayed(".workspace-panel-restore.is-sidebar"), true, "Collapsed layer panel must expose a restore control.");
  await click(".workspace-panel-restore.is-sidebar");
  await waitFor(() => page.evaluate(() => !document.querySelector(".editor-app")?.classList.contains("is-sidebar-hidden")), "layer panel restoration");
  assert.equal(await isDisplayed(".editor-sidebar"), true, "Layer panel must return after restore.");

  await click(".inspector-collapse-button");
  await waitForSelector(".editor-app.is-inspector-hidden");
  assert.equal(await isDisplayed(".inspector"), false, "Collapsed inspector must leave the workspace layout.");
  assert.equal(await isDisplayed(".workspace-panel-restore.is-inspector"), true, "Collapsed inspector must expose a restore control.");
  await click(".workspace-panel-restore.is-inspector");
  await waitFor(() => page.evaluate(() => !document.querySelector(".editor-app")?.classList.contains("is-inspector-hidden")), "inspector restoration");
  assert.equal(await isDisplayed(".inspector"), true, "Inspector must return after restore.");

  await clickByText(".inspector-tab-list button", "Animation");
  await waitForSelector(".editor-app.workspace-mode-animation");
  observations.animationSidebarOwnership = await auditAnimationSidebarOwnership();
  observations.textAnimationWorkflow = await auditTextAnimationWorkflow();
  await waitForSelector(".timeline-v3");
  assert.ok(await count(".timeline-v3 .layer-thumbnail") >= 3, "Timeline rows must retain content-aware layer identities.");
  await click(".timeline-collapse-button");
  await waitForSelector(".editor-app.is-timeline-hidden");
  assert.equal(await count(".timeline-v3"), 0, "Collapsed timeline must be removed from active editing flow.");
  assert.equal(await isDisplayed(".workspace-panel-restore.is-timeline"), true, "Collapsed timeline must expose a restore control.");
  await click(".workspace-panel-restore.is-timeline");
  await waitForSelector(".timeline-v3");
  assert.equal(await count(".workspace-panel-restore.is-timeline"), 0, "Timeline restore control must disappear once restored.");
  observations.timelineLayerReorder = await auditTimelineLayerReorder();
  observations.timelineRulerScrubbing = await auditTimelineRulerScrubbing();
  const timelineWideMaximum = await page.evaluate(() => Number(document.querySelector(".timeline-resize-handle")?.getAttribute("aria-valuemax")));
  await dispatchSeparatorKey(".timeline-resize-handle", "End");
  await waitFor(async () => await separatorValue(".timeline-resize-handle") === timelineWideMaximum, "maximum timeline height");
  const timelineWideRect = await rectOf(".timeline-v3");
  assert.ok(Math.abs(timelineWideRect.height - timelineWideMaximum) <= 1, "Rendered timeline height must match its accessible resize value.");
  observations.visibilityRoundTrip = { sidebar: true, inspector: true, timeline: true, animationOwnsSidebar: true };
  await screenshot("04-panels-restored.png");

  observations.wideLayout = await assertNoOverflow("wide editor");
  await page.setViewport({ width: 1180, height: 760, deviceScaleFactor: 1 });
  await waitFor(async () => await separatorValue(".timeline-resize-handle") <= 450, "responsive timeline height clamp");
  observations.timelineResponsiveHeight = {
    wideMaximum: timelineWideMaximum,
    wideRenderedHeight: timelineWideRect.height,
    compactMaximum: await page.evaluate(() => Number(document.querySelector(".timeline-resize-handle")?.getAttribute("aria-valuemax"))),
    compactHeight: await separatorValue(".timeline-resize-handle"),
    compactRenderedHeight: (await rectOf(".timeline-v3")).height,
  };
  assert.ok(Math.abs(observations.timelineResponsiveHeight.compactRenderedHeight - observations.timelineResponsiveHeight.compactHeight) <= 1, "Responsive timeline clamp must match its rendered height.");
  observations.compactLayout = await assertNoOverflow("compact editor");
  await screenshot("05-compact-editor.png");

  await page.setViewport({ width: 1080, height: 680, deviceScaleFactor: 1 });
  await waitFor(async () => await separatorValue(".timeline-resize-handle") <= 370, "minimum-window timeline clamp");
  observations.minimumWindowLayout = await assertNoOverflow("minimum editor window");

  await page.setViewport(viewport);
  await click(".toolbar-brand-button");
  await waitForSelector(".dashboard-v3");
  await waitForSelector(".project-card-v3 .project-preview-gallery");
  await waitForSelector(".project-motion-preview.is-ready");
  observations.recentProjectPreview = await page.evaluate(() => {
    const card = document.querySelector(".project-card-v3");
    const cover = card?.querySelector(".recent-project-cover")?.getBoundingClientRect();
    const actions = card?.querySelector(".project-card-actions")?.getBoundingClientRect();
    const stage = card?.querySelector(".project-preview-stage")?.getBoundingClientRect();
    return {
      gallery: Boolean(card?.querySelector(".project-preview-gallery")),
      legacyOverlayCount: card?.querySelectorAll(".project-preview-ruler,.project-preview-status,.project-preview-resolution").length ?? -1,
      metadataFooter: Boolean(card?.querySelector(".project-card-copy .project-card-facts")),
      actionsBelowArtwork: Boolean(cover && actions && actions.top >= cover.bottom - 1),
      stage: stage ? { width: stage.width, height: stage.height } : null,
    };
  });
  assert.equal(observations.recentProjectPreview.gallery, true, "Recent projects must use the clean gallery preview surface.");
  assert.equal(observations.recentProjectPreview.legacyOverlayCount, 0, "Technical rulers and badges must not cover project artwork.");
  assert.equal(observations.recentProjectPreview.metadataFooter, true, "Project facts must live in the card footer.");
  assert.equal(observations.recentProjectPreview.actionsBelowArtwork, true, "Secondary project actions must not cover the artwork.");
  assert.ok(observations.recentProjectPreview.stage?.width > 100 && observations.recentProjectPreview.stage?.height > 100, "Recent-project artwork stage is unexpectedly small.");
  observations.dashboardWithProject = await assertNoOverflow("recent-project dashboard", ".dashboard-v3");
  await screenshot("06-recent-project-gallery.png");

  assert.deepEqual(pageErrors, [], `Uncaught page errors: ${pageErrors.join(" | ")}`);
  assert.deepEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join(" | ")}`);

  const screenshots = (await fs.readdir(outputDirectory)).filter((file) => file.endsWith(".png")).sort();
  assert.deepEqual(screenshots, [
    "01-create-project.png",
    "01-dashboard.png",
    "02-content-aware-thumbnails.png",
    "03-panels-resized.png",
    "04-panels-restored.png",
    "05-compact-editor.png",
    "05-inspector-numeric.png",
    "06-recent-project-gallery.png",
  ], "Every required headless UI checkpoint must produce its named screenshot.");
  for (const file of screenshots) {
    const stats = await fs.stat(path.join(outputDirectory, file));
    assert.ok(stats.size > 8_000, `${file} is unexpectedly small (${stats.size} bytes).`);
  }

  console.log(JSON.stringify({
    passed: true,
    appUrl,
    screenshots: screenshots.map((file) => path.join(outputDirectory, file)),
    observations,
    consoleErrors,
    pageErrors,
  }, null, 2));
} finally {
  if (page && !page.closed) await page.close().catch(() => undefined);
  if (browser) await browser.close({ silent: true }).catch(() => undefined);
  if (vite) await vite.close().catch(() => undefined);
}

async function waitFor(predicate, description, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (error) {
      lastError = error;
    }
    await delay(60);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ""}`);
}

async function waitForSelector(selector) {
  await waitFor(() => page.evaluate((value) => {
    const element = document.querySelector(value);
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }, selector), selector);
}

async function click(selector, accessibleText) {
  const clicked = await page.evaluate(({ selector: value, accessibleText: text }) => {
    const candidates = Array.from(document.querySelectorAll(value));
    const element = text
      ? candidates.find((candidate) => candidate.textContent?.replace(/\s+/g, " ").trim().includes(text))
      : candidates[0];
    if (!(element instanceof HTMLElement)) return false;
    element.click();
    return true;
  }, { selector, accessibleText });
  assert.equal(clicked, true, `Could not click ${selector}${accessibleText ? ` (${accessibleText})` : ""}.`);
  await delay(80);
}

async function clickByText(selector, text) {
  await click(selector, text);
}

async function setInputValue(selector, value) {
  const changed = await page.evaluate(({ selector: target, value: nextValue }) => {
    const input = document.querySelector(target);
    if (!(input instanceof HTMLInputElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, { selector, value });
  assert.equal(changed, true, `Could not fill ${selector}.`);
}

async function auditCreateProjectWorkflow() {
  const initial = await page.evaluate(() => ({
    flexibleTimeline: document.querySelector(".flexible-timeline-note")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    advancedOpen: document.querySelector(".create-project-advanced")?.hasAttribute("open") ?? true,
    durationFieldCount: Array.from(document.querySelectorAll(".create-dialog-body label")).filter((label) => label.textContent?.trim().startsWith("Duration")).length,
    formatChoices: document.querySelectorAll('.modal-format-grid [role="radio"]').length,
    checkedFormats: document.querySelectorAll('.modal-format-grid [role="radio"][aria-checked="true"]').length,
    closeLabel: document.querySelector('.create-project-dialog header button')?.getAttribute("aria-label") ?? "",
    submitHint: document.querySelector(".create-project-submit-hint")?.textContent?.trim() ?? "",
  }));
  assert.match(initial.flexibleTimeline, /grows automatically/i, `Creation must explain flexible duration: ${JSON.stringify(initial)}`);
  assert.equal(initial.advancedOpen, false, "Technical project settings must stay collapsed until requested.");
  assert.equal(initial.durationFieldCount, 0, "Users must not choose a fixed duration before entering the editor.");
  assert.equal(initial.formatChoices, 5, "Canvas presets must remain immediately discoverable.");
  assert.equal(initial.checkedFormats, 1, "Canvas size must expose one selected radio option.");
  assert.equal(initial.closeLabel, "Close create project dialog", "The icon-only close action needs an accessible name.");
  assert.match(initial.submitHint, /Enter/i, "Keyboard creation affordance must be visible.");

  await screenshot("01-create-project.png");
  await click(".create-project-advanced > summary");
  await waitForSelector(".create-project-advanced-body select");
  const advanced = await page.evaluate(() => ({
    open: document.querySelector(".create-project-advanced")?.hasAttribute("open") ?? false,
    frameRate: document.querySelector(".create-project-advanced-body select")?.getAttribute("value") ?? (document.querySelector(".create-project-advanced-body select") instanceof HTMLSelectElement ? document.querySelector(".create-project-advanced-body select").value : ""),
    backgroundInputCount: document.querySelectorAll(".create-project-advanced-body .background-control input").length,
  }));
  assert.equal(advanced.open, true, "Advanced project controls must expand on demand.");
  assert.equal(advanced.frameRate, "30", "The standard 30 FPS default must remain available in Advanced settings.");
  assert.equal(advanced.backgroundInputCount, 2, "Advanced settings must retain visual and hex background controls.");
  await click(".create-project-advanced > summary");
  await waitFor(() => page.evaluate(() => !document.querySelector(".create-project-advanced")?.hasAttribute("open")), "advanced project settings collapse");

  await page.evaluate(() => (document.querySelector('.create-project-dialog button[type="submit"]') instanceof HTMLButtonElement ? document.querySelector('.create-project-dialog button[type="submit"]').focus() : undefined));
  await dispatchKeyStroke("Tab");
  const wrappedFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  assert.equal(wrappedFocus, "Close create project dialog", "Tab from the final action must wrap inside the modal.");
  return { initial, advanced, wrappedFocus };
}

async function auditEffectsDisclosure() {
  await waitForSelector(".effects-section-header");
  const initial = await page.evaluate(() => ({
    libraryCount: document.querySelectorAll(".effect-library-grid").length,
    effectCount: document.querySelectorAll(".effect-card").length,
    emptyMessage: document.querySelector(".effect-empty")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    expanded: document.querySelector(".effects-section-header > button")?.getAttribute("aria-expanded"),
  }));
  assert.equal(initial.libraryCount, 0, "The full effect catalog must not crowd the inspector by default.");
  assert.equal(initial.effectCount, 0, "Freshly imported media must start without effects.");
  assert.match(initial.emptyMessage, /No effects applied/i, "The compact effect state must explain that the stack is clean.");
  assert.equal(initial.expanded, "false", "The Add effect control must expose its collapsed state.");

  await clickByText(".effects-section-header > button", "Add effect");
  await waitForSelector(".effect-library-grid");
  assert.equal(await page.evaluate(() => document.querySelector(".effects-section-header > button")?.getAttribute("aria-expanded")), "true");
  await clickByText(".effect-library-grid > button", "Gaussian blur");
  await waitForSelector(".effect-card");
  const applied = await page.evaluate(() => ({
    libraryCount: document.querySelectorAll(".effect-library-grid").length,
    effectCount: document.querySelectorAll(".effect-card").length,
    badge: document.querySelector(".effects-section-header .section-label > span")?.textContent?.trim() ?? "",
  }));
  assert.equal(applied.libraryCount, 0, "Choosing an effect must return focus to the active stack.");
  assert.equal(applied.effectCount, 1, "The selected effect must appear in the stack.");
  assert.equal(applied.badge, "1", "The Effects heading must expose the stack count.");
  await click('.effect-card button[aria-label^="Remove"]');
  await waitFor(() => page.evaluate(() => document.querySelectorAll(".effect-card").length === 0), "effect audit cleanup");
  return { initial, applied, cleanedUp: true };
}

async function importSvgThroughFileInput() {
  const imported = await page.evaluate(() => {
    const input = Array.from(document.querySelectorAll('input[type="file"]')).find((candidate) => candidate.getAttribute("accept")?.includes("image/png"));
    if (!(input instanceof HTMLInputElement)) return false;
    const source = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" rx="28" fill="#18152b"/><circle cx="248" cy="48" r="34" fill="#75e3b3"/><path d="M32 126h192" stroke="#a78bfa" stroke-width="18" stroke-linecap="round"/></svg>';
    const transfer = new DataTransfer();
    transfer.items.add(new File([source], "headless-thumbnail.svg", { type: "image/svg+xml" }));
    Object.defineProperty(input, "files", { configurable: true, value: transfer.files });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  });
  assert.equal(imported, true, "Could not import the SVG through the editor file input.");
}

async function auditCanvasNudge() {
  const selected = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll(".layer-row")).find((candidate) => candidate.querySelector('.layer-thumbnail[data-thumbnail-kind="svg"]'));
    if (!(row instanceof HTMLElement)) return null;
    row.click();
    row.focus();
    const name = row.querySelector(".layer-name-editor")?.value ?? "";
    return {
      id: row.dataset.layerId ?? "",
      name,
      unlocked: Boolean(row.querySelector('button[title="Lock"]')),
      selected: row.getAttribute("aria-selected") === "true",
    };
  });
  assert.ok(selected?.id, "The imported SVG layer must expose a stable layer id for runtime nudge coverage.");
  assert.equal(selected.unlocked, true, "Canvas nudge coverage requires an unlocked layer.");
  await waitFor(() => page.evaluate((layerId) => document.querySelector(`.layer-row[data-layer-id="${CSS.escape(layerId)}"]`)?.getAttribute("aria-selected") === "true", selected.id), "imported SVG layer selection");

  const selectedCanvasRect = await page.evaluate(() => {
    const canvas = document.querySelector(".workspace-artboard.is-active .workspace-artboard-canvas");
    if (!(canvas instanceof HTMLElement)) return null;
    const outlined = Array.from(canvas.querySelectorAll("div")).find((candidate) => {
      const style = getComputedStyle(candidate);
      return style.outlineStyle === "solid" && style.outlineWidth !== "0px" && style.outlineColor !== "rgba(0, 0, 0, 0)";
    });
    if (!(outlined instanceof HTMLElement)) return null;
    const rect = outlined.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
  });
  assert.ok(selectedCanvasRect, "The selected imported SVG must expose a visible canvas selection surface.");
  await clickMouse(selectedCanvasRect.x + selectedCanvasRect.width / 2, selectedCanvasRect.y + selectedCanvasRect.height / 2);
  await waitFor(() => page.evaluate((layerId) => document.querySelector(`.layer-row[data-layer-id="${CSS.escape(layerId)}"]`)?.getAttribute("aria-selected") === "true", selected.id), "canvas-selected SVG layer");

  const initial = await inspectorPosition();
  await focusCanvasKeyboardSurface();
  await dispatchKeyStroke("ArrowRight");
  await waitFor(async () => positionEquals(await inspectorPosition(), { x: initial.x + 1, y: initial.y }), "ArrowRight one-pixel canvas nudge");
  const afterArrowRight = await inspectorPosition();
  assert.deepEqual(afterArrowRight, { x: initial.x + 1, y: initial.y }, "ArrowRight keydown and keyup must move the selected layer exactly one pixel.");

  await dispatchKeyStroke("ArrowDown", { shiftKey: true });
  await waitFor(async () => positionEquals(await inspectorPosition(), { x: afterArrowRight.x, y: afterArrowRight.y + 10 }), "Shift+ArrowDown ten-pixel canvas nudge");
  const afterShiftArrowDown = await inspectorPosition();
  assert.deepEqual(afterShiftArrowDown, { x: afterArrowRight.x, y: afterArrowRight.y + 10 }, "Shift+ArrowDown must move the selected layer exactly ten pixels.");

  const inputFocused = await page.evaluate((layerId) => {
    const input = document.querySelector(`.layer-row[data-layer-id="${CSS.escape(layerId)}"] .layer-name-editor`);
    if (!(input instanceof HTMLInputElement)) return false;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    return document.activeElement === input;
  }, selected.id);
  assert.equal(inputFocused, true, "Could not focus the selected layer's text input for shortcut safety coverage.");
  const beforeInputArrow = await inspectorPosition();
  await dispatchKeyStroke("ArrowRight");
  await delay(80);
  const afterInputArrow = await inspectorPosition();
  assert.deepEqual(afterInputArrow, beforeInputArrow, "Arrow keys focused inside a text input must not nudge the canvas layer.");

  await focusCanvasKeyboardSurface();
  const beforeRepeat = await inspectorPosition();
  await dispatchKeyStroke("ArrowRight", { keydownCount: 4 });
  await waitFor(async () => positionEquals(await inspectorPosition(), { x: beforeRepeat.x + 4, y: beforeRepeat.y }), "held ArrowRight repeated canvas nudge");
  const afterRepeat = await inspectorPosition();
  assert.deepEqual(afterRepeat, { x: beforeRepeat.x + 4, y: beforeRepeat.y }, "Four keydown events in one held-arrow gesture must apply four pixels.");

  await dispatchKeyStroke("z", { ctrlKey: true });
  await waitFor(async () => positionEquals(await inspectorPosition(), beforeRepeat), "single undo of held-arrow gesture");
  const afterRepeatUndo = await inspectorPosition();
  assert.deepEqual(afterRepeatUndo, beforeRepeat, "One undo must revert the complete held-arrow repeat gesture.");

  return {
    selectedLayer: selected,
    selectedThroughCanvas: true,
    initial,
    afterArrowRight,
    afterShiftArrowDown,
    inputFocusedArrowPosition: afterInputArrow,
    repeat: { keydownCount: 4, afterRepeat, afterSingleUndo: afterRepeatUndo },
  };
}

async function auditInspectorNumericInput() {
  const selectedBefore = await selectedLayerIds();
  assert.equal(selectedBefore.length, 1, `Numeric Inspector coverage requires one selected layer: ${JSON.stringify(selectedBefore)}`);

  const scaleBaseline = await numericFieldState("Scale X");
  assert.equal(scaleBaseline.type, "text", "Professional numeric fields must avoid native number-input spinner and wheel behavior.");
  assert.equal(scaleBaseline.inputMode, "decimal", "Numeric fields must expose a decimal mobile input hint.");
  assert.equal(scaleBaseline.role, "spinbutton", "Numeric fields must retain accessible spinbutton semantics.");
  assert.ok(Number.isFinite(scaleBaseline.modelValue), `Scale X must expose its finite model value through aria-valuenow: ${JSON.stringify(scaleBaseline)}`);

  await setNumericDraft("Scale X", "-");
  const partialDraft = await numericFieldState("Scale X");
  assert.equal(partialDraft.displayValue, "-", "A minus sign must remain editable instead of collapsing to zero.");
  assert.ok(numericNear(partialDraft.modelValue, scaleBaseline.modelValue), `A partial minus draft must not mutate the project: ${JSON.stringify({ scaleBaseline, partialDraft })}`);

  await setNumericDraft("Scale X", "1,25", { focus: false });
  await waitFor(async () => numericNear((await numericFieldState("Scale X")).modelValue, 1.25), "localized decimal preview");
  const commaDraft = await numericFieldState("Scale X");
  assert.equal(commaDraft.displayValue, "1,25", "An Indonesian decimal comma must remain intact while editing.");
  assert.ok(numericNear(commaDraft.modelValue, 1.25), `The localized decimal draft must preview as 1.25: ${JSON.stringify(commaDraft)}`);

  await dispatchKeyStroke("Escape");
  await waitFor(async () => {
    const state = await numericFieldState("Scale X");
    return !state.focused && numericNear(state.modelValue, scaleBaseline.modelValue) && numericNear(state.displayNumber, scaleBaseline.modelValue);
  }, "numeric Escape restoration without stale blur commit");
  await delay(180);
  const afterEscape = await numericFieldState("Scale X");
  assert.equal(afterEscape.focused, false, "Escape must release focus after cancelling the numeric edit.");
  assert.ok(numericNear(afterEscape.modelValue, scaleBaseline.modelValue) && numericNear(afterEscape.displayNumber, scaleBaseline.modelValue), `Escape must restore the original value and survive the ensuing blur: ${JSON.stringify({ scaleBaseline, afterEscape })}`);

  const committedScale = Number((scaleBaseline.modelValue + .37).toFixed(2));
  const progressiveDrafts = [committedScale - .2, committedScale - .1, committedScale].map((value) => value.toFixed(2).replace(".", ","));
  for (const [index, draft] of progressiveDrafts.entries()) await setNumericDraft("Scale X", draft, { focus: index === 0 });
  await waitFor(async () => numericNear((await numericFieldState("Scale X")).modelValue, committedScale), "multi-preview numeric edit");
  await dispatchKeyStroke("Enter");
  await waitFor(async () => {
    const state = await numericFieldState("Scale X");
    return numericNear(state.modelValue, committedScale) && numericNear(state.displayNumber, committedScale);
  }, "Enter numeric commit");
  const afterEnter = await numericFieldState("Scale X");
  await focusCanvasKeyboardSurface();
  await dispatchKeyStroke("z", { ctrlKey: true });
  await waitFor(async () => numericNear((await numericFieldState("Scale X")).modelValue, scaleBaseline.modelValue), "single undo of multi-preview numeric edit");
  const afterEnterUndo = await numericFieldState("Scale X");
  assert.ok(numericNear(afterEnterUndo.displayNumber, scaleBaseline.modelValue), `One undo must restore the value from before the entire focus session: ${JSON.stringify({ scaleBaseline, afterEnter, afterEnterUndo })}`);

  const xBaseline = await numericFieldState("X");
  await focusNumericField("X");
  await dispatchKeyStroke("ArrowUp");
  await waitFor(async () => numericNear((await numericFieldState("X")).modelValue, xBaseline.modelValue + 1), "ArrowUp unit numeric step");
  const afterArrow = await numericFieldState("X");
  await dispatchKeyStroke("ArrowUp", { shiftKey: true });
  await waitFor(async () => numericNear((await numericFieldState("X")).modelValue, xBaseline.modelValue + 11), "Shift+ArrowUp coarse numeric step");
  const afterShiftArrow = await numericFieldState("X");
  await dispatchKeyStroke("ArrowDown", { altKey: true });
  await waitFor(async () => numericNear((await numericFieldState("X")).modelValue, xBaseline.modelValue + 10.9), "Alt+ArrowDown fine numeric step");
  const afterAltArrow = await numericFieldState("X");
  await dispatchKeyStroke("Enter");
  await focusCanvasKeyboardSurface();
  await dispatchKeyStroke("z", { ctrlKey: true });
  await waitFor(async () => numericNear((await numericFieldState("X")).modelValue, xBaseline.modelValue), "single undo of numeric arrow-key session");
  const afterArrowUndo = await numericFieldState("X");

  const widthBaseline = await numericFieldState("Width");
  assert.equal(widthBaseline.minValue, 1, `Width must advertise its minimum clamp through aria-valuemin: ${JSON.stringify(widthBaseline)}`);
  await setNumericDraft("Width", "-500");
  await dispatchKeyStroke("Enter");
  await waitFor(async () => numericNear((await numericFieldState("Width")).modelValue, 1), "numeric minimum clamp");
  const afterMinimumClamp = await numericFieldState("Width");
  assert.ok(numericNear(afterMinimumClamp.displayNumber, 1), `Manual entry below the minimum must commit as one, not preserve an invalid width: ${JSON.stringify(afterMinimumClamp)}`);
  await focusCanvasKeyboardSurface();
  await dispatchKeyStroke("z", { ctrlKey: true });
  await waitFor(async () => numericNear((await numericFieldState("Width")).modelValue, widthBaseline.modelValue), "undo of clamped numeric entry");

  const scrubBaseline = await numericFieldState("X");
  const scrubRect = await numericScrubRect("X");
  await dragMouse(scrubRect.x + scrubRect.width / 2, scrubRect.y + scrubRect.height / 2, scrubRect.x + scrubRect.width / 2 + 18, scrubRect.y + scrubRect.height / 2);
  await waitFor(async () => !numericNear((await numericFieldState("X")).modelValue, scrubBaseline.modelValue), "label-drag numeric scrub");
  const afterScrub = await numericFieldState("X");
  assert.ok(afterScrub.modelValue > scrubBaseline.modelValue, `Dragging a numeric label right must increase its value: ${JSON.stringify({ scrubBaseline, afterScrub, scrubRect })}`);
  await focusCanvasKeyboardSurface();
  await dispatchKeyStroke("z", { ctrlKey: true });
  await waitFor(async () => numericNear((await numericFieldState("X")).modelValue, scrubBaseline.modelValue), "single undo of numeric label scrub");
  const afterScrubUndo = await numericFieldState("X");

  assert.deepEqual(await selectedLayerIds(), selectedBefore, "Inspector numeric editing must preserve the active layer selection.");
  await screenshot("05-inspector-numeric.png");
  return {
    selectedLayerIds: selectedBefore,
    partialAndLocalizedDraft: { baseline: scaleBaseline, partialDraft, commaDraft, afterEscape },
    enterAndUndo: { progressiveDrafts, committed: afterEnter, afterSingleUndo: afterEnterUndo },
    arrowModifiers: { baseline: xBaseline, afterArrow, afterShiftArrow, afterAltArrow, afterSingleUndo: afterArrowUndo },
    minimumClamp: { baseline: widthBaseline, clamped: afterMinimumClamp },
    scrub: { baseline: scrubBaseline, afterScrub, afterSingleUndo: afterScrubUndo, rect: scrubRect },
  };
}

async function auditCanvasDirectResize() {
  const shapeLayerId = await layerIdForThumbnailKind("shape");
  assert.ok(shapeLayerId, "Canvas resize coverage requires the newly created shape layer.");
  await clickLayerRow(shapeLayerId);
  await waitForSelectedLayerIds([shapeLayerId], "shape selection for direct resize");

  const changedToLine = await page.evaluate(() => {
    const section = Array.from(document.querySelectorAll(".inspector .property-section")).find((candidate) => candidate.querySelector(":scope > .section-label")?.textContent?.trim() === "Shape style");
    const label = section ? Array.from(section.querySelectorAll("label")).find((candidate) => candidate.firstChild?.textContent?.trim() === "Shape") : null;
    const select = label?.querySelector("select");
    if (!(select instanceof HTMLSelectElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, "line");
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  });
  assert.equal(changedToLine, true, "Could not change the created shape to a line through the Inspector.");
  await waitFor(() => page.evaluate(() => {
    const section = Array.from(document.querySelectorAll(".inspector .property-section")).find((candidate) => candidate.querySelector(":scope > .section-label")?.textContent?.trim() === "Shape style");
    return section?.querySelector("select")?.value === "line";
  }), "line shape Inspector state");

  const lineBefore = await inspectorMeasurements(["Width", "Height"]);
  const heightHandle = await selectionHandleGeometry("Resize layer height");
  assert.ok(heightHandle.layer.width > 4 && heightHandle.layer.height > 4, `Line selection is not a usable canvas target: ${JSON.stringify(heightHandle)}`);
  await dragMouse(
    heightHandle.handle.x + heightHandle.handle.width / 2,
    heightHandle.handle.y + heightHandle.handle.height / 2,
    heightHandle.handle.x + heightHandle.handle.width / 2,
    Math.max(4, heightHandle.layer.y - Math.max(32, heightHandle.layer.height)),
  );
  await waitFor(async () => (await inspectorMeasurements(["Height"])).height <= 1.01, "one-pixel line resize from the canvas");
  const lineAfter = await inspectorMeasurements(["Width", "Height"]);
  assert.ok(lineAfter.height >= .99 && lineAfter.height <= 1.01, `Canvas line resize must reach a true one-pixel thickness: ${JSON.stringify({ lineBefore, lineAfter })}`);
  assert.ok(Math.abs(lineAfter.width - lineBefore.width) <= .01, `The south line handle must not alter width: ${JSON.stringify({ lineBefore, lineAfter })}`);

  const textLayerId = await layerIdForThumbnailKind("text");
  assert.ok(textLayerId, "Canvas text scaling coverage requires the newly created text layer.");
  await clickLayerRow(textLayerId);
  await waitForSelectedLayerIds([textLayerId], "text selection for proportional canvas scale");
  const textBefore = await inspectorMeasurements(["Width", "Height", "Font size"]);
  const scaleHandle = await selectionHandleGeometry("Scale layer");
  const scaleEnd = {
    x: scaleHandle.layer.x + scaleHandle.layer.width * .3,
    y: scaleHandle.layer.y + scaleHandle.layer.height * .3,
  };
  await dragMouse(
    scaleHandle.handle.x + scaleHandle.handle.width / 2,
    scaleHandle.handle.y + scaleHandle.handle.height / 2,
    scaleEnd.x,
    scaleEnd.y,
  );
  await waitFor(async () => {
    const current = await inspectorMeasurements(["Width", "Height", "Font size"]);
    return current.width < textBefore.width * .8 && current.height < textBefore.height * .8 && current.fontSize < textBefore.fontSize * .8;
  }, "proportional text scale from the canvas");
  const textAfter = await inspectorMeasurements(["Width", "Height", "Font size"]);
  assert.ok(textAfter.width >= 4 && textAfter.height >= 4 && textAfter.fontSize >= 1, `Text scale must retain usable minimum geometry: ${JSON.stringify({ textBefore, textAfter })}`);

  return {
    line: { layerId: shapeLayerId, before: lineBefore, after: lineAfter, handle: heightHandle },
    text: { layerId: textLayerId, before: textBefore, after: textAfter, handle: scaleHandle, dragEnd: scaleEnd },
  };
}

async function auditSidebarSelectionAndGrouping() {
  const initialRows = await sidebarLayerRows();
  assert.ok(initialRows.length >= 3, `Sidebar multi-selection coverage requires at least three rows: ${JSON.stringify(initialRows)}`);
  const [first, second] = initialRows;
  const last = initialRows.at(-1);
  assert.ok(last, "Sidebar contiguous-selection coverage is missing its final row.");

  const firstPoint = await layerThumbnailPoint(first.id);
  const secondPoint = await layerThumbnailPoint(second.id);
  const marqueeVisibleDuringDrag = await dragMouseWithObservation(
    firstPoint.x,
    firstPoint.y,
    secondPoint.x,
    secondPoint.y,
    ".layer-list-selection-marquee",
  );
  assert.equal(marqueeVisibleDuringDrag, true, "Dragging across layer rows must expose the sidebar selection box in realtime.");
  await waitForSelectedLayerIds([first.id, second.id], "sidebar drag-box multi-selection");
  const afterMarquee = await selectedLayerIds();

  await clickLayerRow(first.id);
  await waitForSelectedLayerIds([first.id], "plain sidebar selection");
  await clickLayerRow(second.id, { ctrlKey: true });
  await waitForSelectedLayerIds([first.id, second.id], "Ctrl additive sidebar selection");
  const afterCtrlAdd = await selectedLayerIds();
  await clickLayerRow(second.id, { ctrlKey: true });
  await waitForSelectedLayerIds([first.id], "Ctrl toggle-off sidebar selection");
  const afterCtrlRemove = await selectedLayerIds();
  await clickLayerRow(second.id, { ctrlKey: true });
  await waitForSelectedLayerIds([first.id, second.id], "Ctrl toggle-on sidebar selection");

  await clickLayerRow(first.id);
  await clickLayerRow(last.id, { shiftKey: true });
  await waitForSelectedLayerIds(initialRows.map((row) => row.id), "Shift contiguous sidebar selection");
  const afterShiftRange = await selectedLayerIds();

  // Keep one top-level sibling outside the group so the timeline can later
  // verify sibling-safe reordering with a real drag gesture.
  await clickLayerRow(first.id);
  await clickLayerRow(second.id, { ctrlKey: true });
  await waitForSelectedLayerIds([first.id, second.id], "two-layer context selection");
  const contextPoint = await layerThumbnailPoint(second.id);
  await clickMouse(contextPoint.x, contextPoint.y, { button: "right" });
  await waitForSelector(".layer-context-menu");
  const contextHeader = await textOf(".layer-context-menu header strong");
  assert.equal(contextHeader, "2 layers selected", "Right-clicking a selected row must preserve the multi-selection.");
  await clickByText(".layer-context-menu button", "Group Selection");
  await waitForSelector(".layer-row.is-group");
  await waitFor(() => page.evaluate(() => document.querySelectorAll(".layer-row.is-group-child[data-layer-parent-id]").length >= 2), "grouped sidebar children");
  const grouped = await page.evaluate(() => {
    const group = document.querySelector(".layer-row.is-group");
    const groupId = group?.getAttribute("data-layer-id") ?? "";
    const children = Array.from(document.querySelectorAll(`.layer-row.is-group-child[data-layer-parent-id="${CSS.escape(groupId)}"]`)).map((row) => row.getAttribute("data-layer-id") ?? "").filter(Boolean);
    const topLevel = Array.from(document.querySelectorAll(".layer-row[data-layer-id]:not([data-layer-parent-id])")).map((row) => row.getAttribute("data-layer-id") ?? "").filter(Boolean);
    return {
      groupId,
      children,
      topLevel,
      selected: group?.getAttribute("aria-selected") === "true",
      groupTitle: group?.getAttribute("title") ?? "",
    };
  });
  assert.ok(grouped.groupId && grouped.selected, `Grouping must create and select a visible group row: ${JSON.stringify(grouped)}`);
  assert.deepEqual([...grouped.children].sort(), [first.id, second.id].sort(), `Grouped children must retain their sidebar identities: ${JSON.stringify(grouped)}`);
  assert.equal(grouped.topLevel.length, 2, `The group and the ungrouped layer must remain top-level timeline siblings: ${JSON.stringify(grouped)}`);

  return {
    initialRows,
    marquee: { selected: afterMarquee, visibleDuringDrag: marqueeVisibleDuringDrag },
    ctrlToggle: { added: afterCtrlAdd, removed: afterCtrlRemove },
    shiftRange: afterShiftRange,
    contextHeader,
    grouped,
  };
}

async function auditCanvasDeleteShortcut() {
  const beforeRows = await sidebarLayerRows();
  const beforeIds = new Set(beforeRows.map((row) => row.id));
  await clickByText(".layer-quick-add button", "Shape");
  await waitFor(async () => (await sidebarLayerRows()).length === beforeRows.length + 1, "temporary layer creation for Delete shortcut");
  const createdRows = await sidebarLayerRows();
  const created = createdRows.find((row) => !beforeIds.has(row.id));
  assert.ok(created?.id, `The Delete shortcut audit could not identify its temporary layer: ${JSON.stringify({ beforeRows, createdRows })}`);
  await waitForSelectedLayerIds([created.id], "temporary canvas layer selection");

  await waitForSelector('.workspace-artboard.is-active .workspace-artboard-canvas [aria-label="Scale layer"]');
  const previewTarget = await page.evaluate(() => {
    const handle = document.querySelector('.workspace-artboard.is-active .workspace-artboard-canvas [aria-label="Scale layer"]');
    const visual = handle?.parentElement;
    if (!(visual instanceof HTMLElement)) return null;
    const rect = visual.getBoundingClientRect();
    window.__kurogiDisposableLayerVisual = visual;
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width, height: rect.height, connected: visual.isConnected };
  });
  assert.ok(previewTarget?.connected && previewTarget.width > 4 && previewTarget.height > 4, `The disposable layer must expose a real preview target: ${JSON.stringify(previewTarget)}`);

  await dispatchKeyStroke("Escape");
  await waitForSelectedLayerIds([], "Escape preview deselection");
  await clickMouse(previewTarget.x, previewTarget.y);
  await waitForSelectedLayerIds([created.id], "selection originating from the preview canvas");
  await dispatchKeyStroke("Delete");
  await waitFor(() => page.evaluate((layerId) => !document.querySelector(`.layer-row[data-layer-id="${CSS.escape(layerId)}"]`), created.id), "canvas Delete shortcut removal");
  await waitFor(() => page.evaluate(() => !window.__kurogiDisposableLayerVisual?.isConnected), "deleted preview visual removal");
  const afterRows = await sidebarLayerRows();
  assert.deepEqual(afterRows.map((row) => row.id).sort(), beforeRows.map((row) => row.id).sort(), "Deleting the temporary selected layer must preserve every pre-existing layer.");
  return { deletedLayerId: created.id, previewTarget, selectedThroughPreview: true, visualDisconnected: true, remainingLayerIds: afterRows.map((row) => row.id) };
}

async function auditAnimationSidebarOwnership() {
  const animationState = await page.evaluate(() => {
    const sidebar = document.querySelector(".editor-sidebar");
    const style = sidebar instanceof HTMLElement ? getComputedStyle(sidebar) : null;
    return {
      appClass: document.querySelector(".editor-app")?.className ?? "",
      sidebarVisible: Boolean(sidebar instanceof HTMLElement && style?.display !== "none" && sidebar.getBoundingClientRect().width > 0),
      sidebarAriaHidden: sidebar?.getAttribute("aria-hidden") ?? "",
      resizerCount: document.querySelectorAll(".workspace-panel-resizer.is-sidebar").length,
      restoreCount: document.querySelectorAll(".workspace-panel-restore.is-sidebar").length,
      preference: JSON.parse(localStorage.getItem("kurogi-editor-ui-v1") ?? "null")?.sidebarVisible,
    };
  });
  assert.equal(animationState.sidebarVisible, false, `Animation mode must give the timeline exclusive sidebar ownership: ${JSON.stringify(animationState)}`);
  assert.equal(animationState.sidebarAriaHidden, "true", `The hidden layer panel must be removed from assistive navigation in Animation mode: ${JSON.stringify(animationState)}`);
  assert.equal(animationState.resizerCount, 0, "Animation mode must remove the layer-panel resize handle.");
  assert.equal(animationState.restoreCount, 0, "Animation mode must not expose a conflicting layer-panel restore control.");
  assert.equal(animationState.preference, true, "Entering Animation mode must preserve the saved Design layer-panel preference.");

  await clickByText(".inspector-tab-list button", "Design");
  await waitForSelector(".editor-app.workspace-mode-design");
  await waitForSelector(".editor-sidebar");
  await waitForSelector(".workspace-panel-resizer.is-sidebar");
  assert.equal(await isDisplayed(".editor-sidebar"), true, "Returning to Design must restore the previously visible layer panel.");
  const designPreference = await page.evaluate(() => JSON.parse(localStorage.getItem("kurogi-editor-ui-v1") ?? "null")?.sidebarVisible);
  assert.equal(designPreference, true, "Design restoration must not mutate the stored layer-panel preference.");
  assert.equal(await count(".timeline-v3"), 0, "Design mode must release the Animation timeline surface.");

  await clickByText(".inspector-tab-list button", "Animation");
  await waitForSelector(".editor-app.workspace-mode-animation");
  await waitForSelector(".timeline-v3");
  assert.equal(await isDisplayed(".editor-sidebar"), false, "The layer panel must hide again when Animation regains focus.");

  return { animation: animationState, design: { sidebarVisible: true, preference: designPreference }, returnedToAnimation: true };
}

async function auditTextAnimationWorkflow() {
  await clickByText(".inspector-tab-list button", "Design");
  await waitForSelector(".editor-app.workspace-mode-design");
  const before = await count(".layer-row[data-layer-id]");
  await clickByText(".layer-quick-add button", "Text");
  await waitFor(async () => await count(".layer-row[data-layer-id]") === before + 1, "text layer creation for motion workflow");
  await clickByText(".inspector-tab-list button", "Animation");
  await waitForSelector(".animation-empty-state");

  const defaultState = await page.evaluate(() => ({
    counts: Array.from(document.querySelectorAll(".animation-category-tabs button span")).map((badge) => Number(badge.textContent ?? "-1")),
    message: document.querySelector(".animation-empty-state")?.textContent?.trim() ?? "",
  }));
  assert.deepEqual(defaultState.counts, [0, 0, 0], `Newly added text must have no automatic In, Loop, or Out actions: ${JSON.stringify(defaultState)}`);
  assert.match(defaultState.message, /No In animation yet/i, "The Animation inspector must clearly communicate the empty default state.");

  await click(".open-preset-browser");
  await waitForSelector(".motion-preset-dialog");

  const initial = await page.evaluate(() => ({
    labels: Array.from(document.querySelectorAll(".preset-text-scope button")).map((button) => button.textContent?.trim()),
    active: document.querySelector(".preset-text-scope button.active")?.textContent?.trim(),
  }));
  assert.deepEqual(initial.labels, ["Whole", "Lines", "Words", "Letters"], `Text target choices must stay explicit: ${JSON.stringify(initial)}`);
  assert.equal(initial.active, "Whole", "The Motion Library must start from whole-layer motion without applying it automatically.");

  await clickByText(".preset-text-scope button", "Letters");
  await click(".preset-browser-card");
  await waitForSelector(".text-motion-target");
  await waitForSelector(".text-motion-stagger-controls");
  await waitFor(() => page.evaluate(() => document.querySelector(".text-motion-summary")?.textContent?.toLowerCase().includes("letters")), "per-letter duration summary");
  assert.equal(await page.evaluate(() => document.querySelector(".text-motion-scope-picker button.active")?.textContent?.trim()), "Letters");
  assert.equal(await page.evaluate(() => document.querySelector(".timeline-action-scope")?.textContent?.trim()), "CHAR", "Timeline must identify the selected per-letter action.");
  assert.ok(await count(".timeline-action-stagger-tail") >= 1, "Timeline must visualize the effective letter stagger tail.");

  await click('.action-editor-title button[aria-label="Replay this animation"]');
  await waitForSelector('.play-btn[aria-label="Pause playback"]');
  await delay(180);
  const renderedLetters = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('.workspace-artboard.is-active [data-text-motion-unit="character"]'))
      .filter((element) => element instanceof HTMLElement && element.getBoundingClientRect().width > 0);
    const states = spans.map((element) => {
      const style = getComputedStyle(element);
      return { text: element.textContent ?? "", opacity: style.opacity, transform: style.transform };
    });
    return {
      count: states.length,
      text: states.map((state) => state.text).join(""),
      distinctVisualStates: new Set(states.map((state) => `${state.opacity}|${state.transform}`)).size,
    };
  });
  assert.ok(renderedLetters.count >= 2, `The shared preview renderer must emit grapheme spans: ${JSON.stringify(renderedLetters)}`);
  assert.ok(renderedLetters.distinctVisualStates > 1, `Letter delay must produce independently animated visual states: ${JSON.stringify(renderedLetters)}`);
  await click('.play-btn[aria-label="Pause playback"]');
  return {
    defaultState,
    choices: initial.labels,
    selected: "Letters",
    staggerControls: true,
    timelineBadge: "CHAR",
    replayed: true,
    renderedLetters,
  };
}

async function auditTimelineLayerReorder() {
  const initialRows = await timelineLayerRows();
  assert.ok(initialRows.length >= 2, `Timeline reorder coverage requires at least two layer rows: ${JSON.stringify(initialRows)}`);
  const topLevelIds = await page.evaluate(() => Array.from(document.querySelectorAll(".layer-row[data-layer-id]:not([data-layer-parent-id])")).map((row) => row.getAttribute("data-layer-id") ?? "").filter(Boolean));
  const candidates = initialRows.filter((row) => topLevelIds.includes(row.id));
  assert.ok(candidates.length >= 2, `Timeline reorder must use same-parent top-level siblings: ${JSON.stringify({ initialRows, topLevelIds })}`);
  const dragged = candidates[0];
  const target = candidates.at(-1);
  assert.ok(target && dragged.id !== target.id, `Timeline reorder target is invalid: ${JSON.stringify(candidates)}`);

  if (!(await selectedLayerIds()).includes(dragged.id)) {
    await clickMouse(dragged.label.x + Math.min(80, dragged.label.width * .55), dragged.label.y + dragged.label.height / 2);
    await waitFor(() => selectedLayerIds().then((ids) => ids.includes(dragged.id)), "timeline row selection before reorder");
  }
  const selectionBefore = await selectedLayerIds();
  await page.evaluate((layerId) => {
    const grip = document.querySelector(`[data-timeline-layer-id="${CSS.escape(layerId)}"] .timeline-layer-reorder-grip`);
    if (!(grip instanceof HTMLElement)) throw new Error("Timeline reorder grip disappeared.");
    window.__kurogiTimelineLayerReorderCaptureAudit = { got: 0, lost: 0 };
    grip.addEventListener("gotpointercapture", () => { window.__kurogiTimelineLayerReorderCaptureAudit.got += 1; });
    grip.addEventListener("lostpointercapture", () => { window.__kurogiTimelineLayerReorderCaptureAudit.lost += 1; });
  }, dragged.id);

  const client = page._client();
  const startX = dragged.grip.x + dragged.grip.width / 2;
  const startY = dragged.grip.y + dragged.grip.height / 2;
  const endX = target.grip.x + target.grip.width / 2;
  const endY = target.row.y + target.row.height / 2;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: startX, y: startY, button: "none" });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: startX, y: startY, button: "left", buttons: 1, clickCount: 1 });
  for (let step = 1; step <= 5; step += 1) {
    const progress = step / 5;
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: startX + (endX - startX) * progress, y: startY + (endY - startY) * progress, button: "left", buttons: 1 });
    await delay(24);
  }
  const live = await page.evaluate(() => ({
    bodyClass: document.body.classList.contains("timeline-layer-reordering"),
    indicatorCount: document.querySelectorAll(".timeline-layer-drop-indicator").length,
    indicatorClass: document.querySelector(".timeline-layer-drop-indicator")?.className ?? "",
  }));
  assert.equal(live.bodyClass, true, `Timeline reorder must expose a live drag state: ${JSON.stringify(live)}`);
  assert.equal(live.indicatorCount, 1, `Timeline reorder must expose exactly one insertion indicator: ${JSON.stringify(live)}`);
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: endX, y: endY, button: "left", buttons: 0, clickCount: 1 });
  await waitFor(async () => {
    const next = await timelineLayerRows();
    return next.map((row) => row.id).join("|") !== initialRows.map((row) => row.id).join("|");
  }, "timeline layer reorder commit");
  const afterRows = await timelineLayerRows();
  const selectionAfter = await selectedLayerIds();
  const capture = await page.evaluate(() => window.__kurogiTimelineLayerReorderCaptureAudit ?? null);
  assert.ok(capture?.got >= 1 && capture?.lost >= 1, `Timeline layer reorder must capture and release its pointer: ${JSON.stringify(capture)}`);
  assert.deepEqual(selectionAfter, selectionBefore, "Timeline layer reorder must preserve the active selection.");
  assert.equal(await page.evaluate(() => document.body.classList.contains("timeline-layer-reordering")), false, "Timeline reorder body state must clear after release.");
  assert.equal(await count(".timeline-layer-drop-indicator"), 0, "Timeline reorder insertion indicator must clear after release.");
  const afterIds = afterRows.map((row) => row.id);
  assert.ok(afterIds.indexOf(dragged.id) > afterIds.indexOf(target.id), `Dragging the row onto the lower sibling must move it below that sibling: ${JSON.stringify({ initialRows, afterRows })}`);
  await page.evaluate(() => {
    const tracks = document.querySelector(".timeline-v3 .tracks");
    if (tracks instanceof HTMLElement) tracks.scrollTop = 0;
  });

  return {
    before: initialRows.map(({ id, name }) => ({ id, name })),
    after: afterRows.map(({ id, name }) => ({ id, name })),
    draggedId: dragged.id,
    targetId: target.id,
    live,
    capture,
    selectionBefore,
    selectionAfter,
  };
}

async function layerIdForThumbnailKind(kind) {
  return page.evaluate((value) => document.querySelector(`.layer-row:has(.layer-thumbnail[data-thumbnail-kind="${CSS.escape(value)}"])`)?.getAttribute("data-layer-id") ?? "", kind);
}

async function sidebarLayerRows() {
  return page.evaluate(() => Array.from(document.querySelectorAll(".layer-list .layer-row[data-layer-id]")).map((row) => ({
    id: row.getAttribute("data-layer-id") ?? "",
    name: row.querySelector(".layer-name-editor")?.value ?? "",
    selected: row.getAttribute("aria-selected") === "true",
    parentId: row.getAttribute("data-layer-parent-id") ?? "",
  })).filter((row) => row.id));
}

async function timelineLayerRows() {
  return page.evaluate(() => Array.from(document.querySelectorAll(".timeline-v3 [data-timeline-layer-row='true']")).map((element) => {
    const row = element.getBoundingClientRect();
    const labelElement = element.querySelector(".timeline-layer-row-label");
    const gripElement = element.querySelector(".timeline-layer-reorder-grip");
    const label = labelElement?.getBoundingClientRect();
    const grip = gripElement?.getBoundingClientRect();
    return {
      id: element.getAttribute("data-timeline-layer-id") ?? "",
      name: element.querySelector(".track-name")?.textContent?.trim() ?? "",
      row: { x: row.x, y: row.y, width: row.width, height: row.height },
      label: label ? { x: label.x, y: label.y, width: label.width, height: label.height } : { x: 0, y: 0, width: 0, height: 0 },
      grip: grip ? { x: grip.x, y: grip.y, width: grip.width, height: grip.height } : { x: 0, y: 0, width: 0, height: 0 },
    };
  }).filter((row) => row.id && row.row.width > 0 && row.row.height > 0));
}

async function layerThumbnailPoint(layerId) {
  const point = await page.evaluate((id) => {
    const thumbnail = document.querySelector(`.layer-row[data-layer-id="${CSS.escape(id)}"] .layer-thumbnail`);
    if (!(thumbnail instanceof HTMLElement)) return null;
    const rect = thumbnail.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
  }, layerId);
  assert.ok(point, `Layer ${layerId} does not expose a visible thumbnail pointer target.`);
  return point;
}

async function clickLayerRow(layerId, modifiers = {}) {
  const point = await layerThumbnailPoint(layerId);
  await clickMouse(point.x, point.y, modifiers);
}

async function waitForSelectedLayerIds(expected, description) {
  const sorted = [...expected].sort();
  await waitFor(async () => {
    const actual = await selectedLayerIds();
    return actual.length === sorted.length && actual.every((id, index) => id === sorted[index]);
  }, description);
  assert.deepEqual(await selectedLayerIds(), sorted, `Unexpected selection after ${description}.`);
}

async function numericFieldState(label) {
  const state = await page.evaluate((requestedLabel) => {
    const field = Array.from(document.querySelectorAll(".inspector [data-numeric-field]")).find((candidate) => candidate.getAttribute("data-numeric-field") === requestedLabel);
    const input = field?.querySelector(`[data-numeric-input="${CSS.escape(requestedLabel)}"]`);
    const scrub = field?.querySelector(`[data-numeric-scrub="${CSS.escape(requestedLabel)}"]`);
    if (!(field instanceof HTMLElement) || !(input instanceof HTMLInputElement) || !(scrub instanceof HTMLElement)) return null;
    const ariaValue = input.getAttribute("aria-valuenow");
    const ariaMin = input.getAttribute("aria-valuemin");
    const ariaMax = input.getAttribute("aria-valuemax");
    const normalizedDisplay = input.value.trim().replace(",", ".");
    return {
      label: requestedLabel,
      displayValue: input.value,
      displayNumber: normalizedDisplay ? Number(normalizedDisplay) : Number.NaN,
      modelValue: ariaValue === null ? Number.NaN : Number(ariaValue),
      minValue: ariaMin === null ? null : Number(ariaMin),
      maxValue: ariaMax === null ? null : Number(ariaMax),
      type: input.type,
      inputMode: input.inputMode,
      role: input.getAttribute("role"),
      focused: document.activeElement === input,
      hasFieldHook: field.dataset.numericField === requestedLabel,
      hasInputHook: input.dataset.numericInput === requestedLabel,
      hasScrubHook: scrub.dataset.numericScrub === requestedLabel,
    };
  }, label);
  assert.ok(state?.hasFieldHook && state.hasInputHook && state.hasScrubHook, `Inspector numeric field ${label} is unavailable or missing stable audit hooks: ${JSON.stringify(state)}`);
  return state;
}

async function focusNumericField(label) {
  const focused = await page.evaluate((requestedLabel) => {
    const input = document.querySelector(`.inspector [data-numeric-input="${CSS.escape(requestedLabel)}"]`);
    if (!(input instanceof HTMLInputElement)) return false;
    input.focus({ preventScroll: true });
    input.select();
    return document.activeElement === input;
  }, label);
  assert.equal(focused, true, `Could not focus Inspector numeric field ${label}.`);
}

async function setNumericDraft(label, draft, { focus = true } = {}) {
  const changed = await page.evaluate(({ requestedLabel, nextDraft, shouldFocus }) => {
    const input = document.querySelector(`.inspector [data-numeric-input="${CSS.escape(requestedLabel)}"]`);
    if (!(input instanceof HTMLInputElement)) return false;
    if (shouldFocus) {
      input.focus({ preventScroll: true });
      input.select();
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) return false;
    setter.call(input, nextDraft);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: nextDraft }));
    return document.activeElement === input;
  }, { requestedLabel: label, nextDraft: draft, shouldFocus: focus });
  assert.equal(changed, true, `Could not enter numeric draft ${JSON.stringify(draft)} in ${label}.`);
  await delay(70);
}

async function numericScrubRect(label) {
  const rect = await page.evaluate((requestedLabel) => {
    const scrub = document.querySelector(`.inspector [data-numeric-scrub="${CSS.escape(requestedLabel)}"]`);
    if (!(scrub instanceof HTMLElement)) return null;
    const bounds = scrub.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0 ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null;
  }, label);
  assert.ok(rect && rect.width >= 12 && rect.height >= 12, `Numeric scrub handle ${label} is not a usable pointer target: ${JSON.stringify(rect)}`);
  return rect;
}

function numericNear(actual, expected, tolerance = 1e-6) {
  return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance;
}

async function inspectorMeasurements(labels) {
  const result = await page.evaluate((requestedLabels) => {
    const normalizeKey = (label) => label.replace(/\s+/g, " ").trim().replace(/\s+(.)/g, (_, letter) => letter.toUpperCase()).replace(/^./, (letter) => letter.toLowerCase());
    const entries = requestedLabels.map((label) => {
      const input = document.querySelector(`.inspector [data-numeric-input="${CSS.escape(label)}"]`);
      const ariaValue = input?.getAttribute("aria-valuenow");
      return [normalizeKey(label), input instanceof HTMLInputElement ? Number(ariaValue ?? input.value.replace(",", ".")) : Number.NaN];
    });
    return Object.fromEntries(entries);
  }, labels);
  for (const label of labels) {
    const key = label.replace(/\s+/g, " ").trim().replace(/\s+(.)/g, (_, letter) => letter.toUpperCase()).replace(/^./, (letter) => letter.toLowerCase());
    assert.ok(Number.isFinite(result[key]), `Inspector measurement ${label} is unavailable: ${JSON.stringify(result)}`);
  }
  return result;
}

async function selectionHandleGeometry(label) {
  await waitForSelector(`.workspace-artboard.is-active .workspace-artboard-canvas [aria-label="${label}"]`);
  const geometry = await page.evaluate((accessibleLabel) => {
    const handle = document.querySelector(`.workspace-artboard.is-active .workspace-artboard-canvas [aria-label="${CSS.escape(accessibleLabel)}"]`);
    const layer = handle?.parentElement;
    if (!(handle instanceof HTMLElement) || !(layer instanceof HTMLElement)) return null;
    const handleRect = handle.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    return {
      handle: { x: handleRect.x, y: handleRect.y, width: handleRect.width, height: handleRect.height },
      layer: { x: layerRect.x, y: layerRect.y, width: layerRect.width, height: layerRect.height },
    };
  }, label);
  assert.ok(geometry, `Could not measure the ${label} canvas handle.`);
  return geometry;
}

async function dragMouseWithObservation(startX, startY, endX, endY, observationSelector) {
  const client = page._client();
  let observed = false;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: startX, y: startY, button: "none" });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: startX, y: startY, button: "left", buttons: 1, clickCount: 1 });
  for (let step = 1; step <= 6; step += 1) {
    const progress = step / 6;
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: startX + (endX - startX) * progress, y: startY + (endY - startY) * progress, button: "left", buttons: 1 });
    await delay(24);
    observed ||= await isDisplayed(observationSelector);
  }
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: endX, y: endY, button: "left", buttons: 0, clickCount: 1 });
  await delay(100);
  return observed;
}

async function inspectorPosition() {
  const position = await page.evaluate(() => {
    const transformSection = Array.from(document.querySelectorAll(".inspector .property-section")).find((section) => section.querySelector(":scope > .section-label")?.textContent?.trim() === "Transform");
    if (!(transformSection instanceof HTMLElement)) return null;
    const valueFor = (axis) => {
      const input = transformSection.querySelector(`[data-numeric-input="${CSS.escape(axis)}"]`);
      const ariaValue = input?.getAttribute("aria-valuenow");
      return input instanceof HTMLInputElement ? Number(ariaValue ?? input.value.replace(",", ".")) : Number.NaN;
    };
    return { x: valueFor("X"), y: valueFor("Y") };
  });
  assert.ok(position && Number.isFinite(position.x) && Number.isFinite(position.y), `Inspector X/Y fields are unavailable: ${JSON.stringify(position)}`);
  return position;
}

function positionEquals(actual, expected) {
  return actual.x === expected.x && actual.y === expected.y;
}

async function focusCanvasKeyboardSurface() {
  const focused = await page.evaluate(() => {
    const canvas = document.querySelector(".workspace-artboard.is-active .workspace-artboard-canvas");
    if (!(canvas instanceof HTMLElement)) return false;
    canvas.tabIndex = -1;
    canvas.focus({ preventScroll: true });
    return document.activeElement === canvas;
  });
  assert.equal(focused, true, "Could not focus the selected layer's canvas keyboard surface.");
}

async function dispatchKeyStroke(key, { shiftKey = false, ctrlKey = false, altKey = false, keydownCount = 1 } = {}) {
  const mapping = {
    ArrowLeft: { code: "ArrowLeft", virtualKeyCode: 37 },
    ArrowUp: { code: "ArrowUp", virtualKeyCode: 38 },
    ArrowRight: { code: "ArrowRight", virtualKeyCode: 39 },
    ArrowDown: { code: "ArrowDown", virtualKeyCode: 40 },
    Delete: { code: "Delete", virtualKeyCode: 46 },
    Escape: { code: "Escape", virtualKeyCode: 27 },
    Tab: { code: "Tab", virtualKeyCode: 9 },
    Enter: { code: "Enter", virtualKeyCode: 13 },
    z: { code: "KeyZ", virtualKeyCode: 90 },
  }[key];
  assert.ok(mapping, `Unsupported headless audit key: ${key}`);
  assert.ok(Number.isInteger(keydownCount) && keydownCount >= 1, "keydownCount must be a positive integer.");
  const modifiers = (altKey ? 1 : 0) | (ctrlKey ? 2 : 0) | (shiftKey ? 8 : 0);
  const client = page._client();
  for (let index = 0; index < keydownCount; index += 1) {
    await client.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key,
      code: mapping.code,
      modifiers,
      autoRepeat: index > 0,
      windowsVirtualKeyCode: mapping.virtualKeyCode,
      nativeVirtualKeyCode: mapping.virtualKeyCode,
    });
  }
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code: mapping.code,
    modifiers,
    windowsVirtualKeyCode: mapping.virtualKeyCode,
    nativeVirtualKeyCode: mapping.virtualKeyCode,
  });
  await delay(100);
}

async function separatorValue(selector) {
  return page.evaluate((value) => Number(document.querySelector(value)?.getAttribute("aria-valuenow")), selector);
}

async function dispatchSeparatorKey(selector, key) {
  const dispatched = await page.evaluate(({ selector: value, key: keyboardKey }) => {
    const separator = document.querySelector(value);
    if (!(separator instanceof HTMLElement)) return false;
    separator.focus();
    separator.dispatchEvent(new KeyboardEvent("keydown", { key: keyboardKey, code: keyboardKey, bubbles: true, cancelable: true }));
    return true;
  }, { selector, key });
  assert.equal(dispatched, true, `Could not send ${key} to ${selector}.`);
}

async function rectOf(selector) {
  const rect = await page.evaluate((value) => {
    const element = document.querySelector(value);
    if (!(element instanceof HTMLElement)) return null;
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }, selector);
  assert.ok(rect, `Could not measure ${selector}.`);
  return rect;
}

async function dragMouse(startX, startY, endX, endY) {
  const client = page._client();
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: startX, y: startY, button: "none" });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: startX, y: startY, button: "left", buttons: 1, clickCount: 1 });
  for (let step = 1; step <= 5; step += 1) {
    const progress = step / 5;
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: startX + (endX - startX) * progress, y: startY + (endY - startY) * progress, button: "left", buttons: 1 });
  }
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: endX, y: endY, button: "left", buttons: 0, clickCount: 1 });
  await delay(100);
}

async function clickMouse(x, y, { button = "left", ctrlKey = false, metaKey = false, shiftKey = false, altKey = false } = {}) {
  const client = page._client();
  const modifiers = (altKey ? 1 : 0) | (ctrlKey ? 2 : 0) | (metaKey ? 4 : 0) | (shiftKey ? 8 : 0);
  const buttons = button === "right" ? 2 : button === "middle" ? 4 : 1;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", modifiers });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button, buttons, modifiers, clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button, buttons: 0, modifiers, clickCount: 1 });
  await delay(100);
}

async function auditTimelineRulerScrubbing() {
  const selector = "[data-timeline-ruler]";
  await waitForSelector(selector);
  const selectionBefore = await selectedLayerIds();
  const initial = await timelineRulerState();
  assert.ok(initial.ruler.width > 200 && initial.ruler.height >= 20, `Timeline ruler is not a usable pointer target: ${JSON.stringify(initial)}`);
  assert.ok(initial.firstTrack && initial.ruler.bottom <= initial.firstTrack.top + 1, `Timeline ruler must occupy its own row above the first track: ${JSON.stringify(initial)}`);
  assert.ok(initial.playhead.yellow, `Timeline playhead must retain its visible yellow treatment: ${JSON.stringify(initial.playhead)}`);

  const clickRatio = .28;
  await clickMouse(initial.ruler.left + initial.ruler.width * clickRatio, initial.ruler.top + initial.ruler.height / 2);
  await waitFor(async () => {
    const state = await timelineRulerState();
    return Math.abs(state.playhead.normalized - clickRatio) <= .04 && state.currentSeconds > state.durationSeconds * .2;
  }, "timeline ruler click seek");
  const afterClick = await timelineRulerState();
  assert.notEqual(afterClick.transportText, initial.transportText, "Clicking the ruler must update the visible transport time.");
  assert.ok(Math.abs(afterClick.currentSeconds / afterClick.durationSeconds - afterClick.playhead.normalized) <= .04, `Visible time and playhead position disagree after ruler click: ${JSON.stringify(afterClick)}`);

  await page.evaluate((value) => {
    const ruler = document.querySelector(value);
    if (!(ruler instanceof HTMLElement)) throw new Error("Timeline ruler audit hook disappeared.");
    window.__kurogiTimelineRulerCaptureAudit = { got: 0, lost: 0, moves: 0 };
    ruler.addEventListener("gotpointercapture", () => { window.__kurogiTimelineRulerCaptureAudit.got += 1; });
    ruler.addEventListener("lostpointercapture", () => { window.__kurogiTimelineRulerCaptureAudit.lost += 1; });
    ruler.addEventListener("pointermove", (event) => {
      if (event.buttons === 1) window.__kurogiTimelineRulerCaptureAudit.moves += 1;
    });
  }, selector);

  const dragStartX = afterClick.ruler.left + afterClick.ruler.width * .35;
  const dragStartY = afterClick.ruler.top + afterClick.ruler.height / 2;
  const dragEndX = afterClick.ruler.right + Math.max(90, afterClick.ruler.width * .12);
  const dragEndY = afterClick.ruler.bottom + 72;
  await dragMouse(dragStartX, dragStartY, dragEndX, dragEndY);
  await waitFor(async () => (await timelineRulerState()).playhead.normalized >= .96, "captured ruler drag outside its bounds");
  const afterDrag = await timelineRulerState();
  const capture = await page.evaluate(() => window.__kurogiTimelineRulerCaptureAudit ?? null);
  assert.ok(capture?.got >= 1, `Ruler drag must establish pointer capture: ${JSON.stringify(capture)}`);
  assert.ok(capture?.moves >= 2, `Captured ruler must continue receiving pointer moves outside its bounds: ${JSON.stringify(capture)}`);
  assert.ok(capture?.lost >= 1, `Ruler must release pointer capture after scrubbing: ${JSON.stringify(capture)}`);
  assert.ok(afterDrag.currentSeconds >= afterDrag.durationSeconds * .95, `Captured drag must clamp to the end of the timeline and update visible time: ${JSON.stringify(afterDrag)}`);
  assert.ok(Math.abs(afterDrag.currentSeconds / afterDrag.durationSeconds - afterDrag.playhead.normalized) <= .04, `Visible time and playhead position disagree after captured ruler drag: ${JSON.stringify(afterDrag)}`);
  const selectionAfter = await selectedLayerIds();
  assert.deepEqual(selectionAfter, selectionBefore, "Timeline ruler scrubbing must not change the active layer selection.");
  assert.equal(await count(".timeline-selection-marquee"), 0, "Timeline ruler scrubbing must not leave a selection marquee behind.");

  return { initial, afterClick, afterDrag, capture, selectionBefore, selectionAfter, marqueeCount: 0, outsideDrag: { startX: dragStartX, startY: dragStartY, endX: dragEndX, endY: dragEndY } };
}

async function selectedLayerIds() {
  return page.evaluate(() => Array.from(document.querySelectorAll('.layer-row[aria-selected="true"]')).map((row) => row.getAttribute("data-layer-id") ?? "").filter(Boolean).sort());
}

async function timelineRulerState() {
  return page.evaluate(() => {
    const ruler = document.querySelector("[data-timeline-ruler]");
    const playhead = document.querySelector(".timeline-v3 .playhead");
    const firstTrack = document.querySelector(".timeline-v3 .track");
    const transport = document.querySelector(".timeline-v3 .timeline-transport > span");
    if (!(ruler instanceof HTMLElement) || !(playhead instanceof HTMLElement) || !(transport instanceof HTMLElement)) throw new Error("Timeline ruler, playhead, or transport time is unavailable.");
    const rulerRect = ruler.getBoundingClientRect();
    const playheadRect = playhead.getBoundingClientRect();
    const trackRect = firstTrack?.getBoundingClientRect();
    const transportText = transport.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const [currentText = "", durationText = ""] = transportText.split("/").map((value) => value.trim());
    const parseTime = (value) => {
      const match = /^(\d+):(\d+(?:\.\d+)?)$/.exec(value);
      return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
    };
    const color = getComputedStyle(playhead).backgroundColor;
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
    return {
      ruler: { left: rulerRect.left, right: rulerRect.right, top: rulerRect.top, bottom: rulerRect.bottom, width: rulerRect.width, height: rulerRect.height, zIndex: getComputedStyle(ruler).zIndex },
      firstTrack: trackRect ? { top: trackRect.top, bottom: trackRect.bottom } : null,
      playhead: {
        left: playheadRect.left,
        normalized: Math.max(0, Math.min(1, (playheadRect.left - rulerRect.left) / Math.max(1, rulerRect.width))),
        color,
        yellow: channels.length === 3 && channels[0] >= 180 && channels[1] >= 120 && channels[1] < channels[0] && channels[2] <= 140,
      },
      transportText,
      currentSeconds: parseTime(currentText),
      durationSeconds: parseTime(durationText),
    };
  });
}

async function isDisplayed(selector) {
  return page.evaluate((value) => {
    const element = document.querySelector(value);
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }, selector);
}

async function count(selector) {
  return page.evaluate((value) => document.querySelectorAll(value).length, selector);
}

async function textOf(selector) {
  return page.evaluate((value) => document.querySelector(value)?.textContent?.trim() ?? "", selector);
}

async function assertNoOverflow(label, rootSelector = ".editor-app") {
  const layout = await page.evaluate((selector) => {
    const root = document.documentElement;
    const body = document.body;
    const app = document.querySelector(selector);
    const appRect = app?.getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      rootScrollWidth: root.scrollWidth,
      rootScrollHeight: root.scrollHeight,
      bodyScrollWidth: body.scrollWidth,
      bodyScrollHeight: body.scrollHeight,
      appRect: appRect ? { x: appRect.x, y: appRect.y, width: appRect.width, height: appRect.height, right: appRect.right, bottom: appRect.bottom } : null,
      visibleRegions: Array.from(document.querySelectorAll(".editor-toolbar, .editor-context-ribbon, .editor-workspace, .timeline-v3")).filter((node) => {
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden";
      }).map((node) => {
        const rect = node.getBoundingClientRect();
        return { className: node.className, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
      }),
    };
  }, rootSelector);
  assert.ok(layout.rootScrollWidth <= layout.innerWidth + 1, `${label} overflows horizontally at the document root: ${JSON.stringify(layout)}`);
  assert.ok(layout.rootScrollHeight <= layout.innerHeight + 1, `${label} overflows vertically at the document root: ${JSON.stringify(layout)}`);
  assert.ok(layout.bodyScrollWidth <= layout.innerWidth + 1, `${label} overflows horizontally at body: ${JSON.stringify(layout)}`);
  assert.ok(layout.bodyScrollHeight <= layout.innerHeight + 1, `${label} overflows vertically at body: ${JSON.stringify(layout)}`);
  assert.ok(layout.appRect && layout.appRect.x >= -1 && layout.appRect.y >= -1 && layout.appRect.right <= layout.innerWidth + 1 && layout.appRect.bottom <= layout.innerHeight + 1, `${label} app shell exceeds the viewport: ${JSON.stringify(layout)}`);
  for (const region of layout.visibleRegions) {
    assert.ok(region.x >= -1 && region.y >= -1 && region.right <= layout.innerWidth + 1 && region.bottom <= layout.innerHeight + 1, `${label} region exceeds the viewport: ${JSON.stringify(region)}`);
  }
  return layout;
}

async function screenshot(filename) {
  const response = await page._client().send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const data = response.value?.data;
  assert.equal(typeof data, "string", `Chrome did not return screenshot data for ${filename}.`);
  await fs.writeFile(path.join(outputDirectory, filename), Buffer.from(data, "base64"));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
