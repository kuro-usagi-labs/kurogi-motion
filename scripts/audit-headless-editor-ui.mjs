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

  await click("button.dashboard-primary-action", "Create project");
  await waitForSelector(".create-project-dialog");
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
  observations.canvasNudge = await auditCanvasNudge();
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
  await waitForSelector(".timeline-v3");
  assert.ok(await count(".timeline-v3 .layer-thumbnail") >= 3, "Timeline rows must retain content-aware layer identities.");
  await click(".timeline-collapse-button");
  await waitForSelector(".editor-app.is-timeline-hidden");
  assert.equal(await count(".timeline-v3"), 0, "Collapsed timeline must be removed from active editing flow.");
  assert.equal(await isDisplayed(".workspace-panel-restore.is-timeline"), true, "Collapsed timeline must expose a restore control.");
  await click(".workspace-panel-restore.is-timeline");
  await waitForSelector(".timeline-v3");
  assert.equal(await count(".workspace-panel-restore.is-timeline"), 0, "Timeline restore control must disappear once restored.");
  observations.timelineRulerScrubbing = await auditTimelineRulerScrubbing();
  const timelineWideMaximum = await page.evaluate(() => Number(document.querySelector(".timeline-resize-handle")?.getAttribute("aria-valuemax")));
  await dispatchSeparatorKey(".timeline-resize-handle", "End");
  await waitFor(async () => await separatorValue(".timeline-resize-handle") === timelineWideMaximum, "maximum timeline height");
  const timelineWideRect = await rectOf(".timeline-v3");
  assert.ok(Math.abs(timelineWideRect.height - timelineWideMaximum) <= 1, "Rendered timeline height must match its accessible resize value.");
  observations.visibilityRoundTrip = { sidebar: true, inspector: true, timeline: true };
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
  assert.equal(screenshots.length, 6, "Every required headless UI checkpoint must produce a screenshot.");
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

async function inspectorPosition() {
  const position = await page.evaluate(() => {
    const transformSection = Array.from(document.querySelectorAll(".inspector .property-section")).find((section) => section.querySelector(":scope > .section-label")?.textContent?.trim() === "Transform");
    if (!(transformSection instanceof HTMLElement)) return null;
    const valueFor = (axis) => {
      const label = Array.from(transformSection.querySelectorAll("label.number-field")).find((candidate) => candidate.firstChild?.textContent?.trim() === axis);
      const input = label?.querySelector('input[type="number"]');
      return input instanceof HTMLInputElement ? Number(input.value) : Number.NaN;
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

async function dispatchKeyStroke(key, { shiftKey = false, ctrlKey = false, keydownCount = 1 } = {}) {
  const mapping = {
    ArrowLeft: { code: "ArrowLeft", virtualKeyCode: 37 },
    ArrowUp: { code: "ArrowUp", virtualKeyCode: 38 },
    ArrowRight: { code: "ArrowRight", virtualKeyCode: 39 },
    ArrowDown: { code: "ArrowDown", virtualKeyCode: 40 },
    z: { code: "KeyZ", virtualKeyCode: 90 },
  }[key];
  assert.ok(mapping, `Unsupported headless audit key: ${key}`);
  assert.ok(Number.isInteger(keydownCount) && keydownCount >= 1, "keydownCount must be a positive integer.");
  const modifiers = (ctrlKey ? 2 : 0) | (shiftKey ? 8 : 0);
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

async function clickMouse(x, y) {
  const client = page._client();
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
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
