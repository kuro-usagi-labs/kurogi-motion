const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
  const output = path.resolve("artifacts", "ui-audit");
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1560, height: 980 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(output, "dashboard.png"), fullPage: true });
  await page.getByRole("button", { name: "Create project" }).first().click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(output, "create-project.png"), fullPage: true });
  await page.locator("input").nth(1).fill("UI flow audit");
  await page.getByRole("button", { name: "Create project", exact: true }).last().click();
  await page.locator(".editor-app").waitFor({ state: "visible" });
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".editor-context-ribbon").count(), 1);
  assert.equal(await page.locator(".command-palette-trigger").count(), 1);
  assert.equal(await page.locator(".scene-transition-control").count(), 1);
  await page.locator(".layer-quick-add button").filter({ hasText: "Text" }).click();
  await page.waitForTimeout(150);
  assert.ok(await page.locator(".timeline-layer-span").count() >= 1, "A new layer must expose a draggable timeline lifespan.");
  await page.screenshot({ path: path.join(output, "editor-wide.png"), fullPage: true });

  await page.keyboard.press("Control+K");
  await page.locator(".command-palette").waitFor({ state: "visible" });
  await page.locator(".command-palette-search input").fill("export");
  assert.ok(await page.locator(".command-palette-results button").count() >= 1);
  await page.screenshot({ path: path.join(output, "command-palette.png"), fullPage: true });
  await page.keyboard.press("Escape");

  const wideLayout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, scrollHeight: document.documentElement.scrollHeight, innerHeight: window.innerHeight }));
  assert.ok(wideLayout.scrollWidth <= wideLayout.innerWidth, `Wide editor overflows horizontally: ${JSON.stringify(wideLayout)}`);
  assert.ok(wideLayout.scrollHeight <= wideLayout.innerHeight, `Wide editor overflows vertically: ${JSON.stringify(wideLayout)}`);

  await page.setViewportSize({ width: 1180, height: 760 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(output, "editor-compact.png"), fullPage: true });
  const compactLayout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, scrollHeight: document.documentElement.scrollHeight, innerHeight: window.innerHeight }));
  assert.ok(compactLayout.scrollWidth <= compactLayout.innerWidth, `Compact editor overflows horizontally: ${JSON.stringify(compactLayout)}`);
  assert.ok(compactLayout.scrollHeight <= compactLayout.innerHeight, `Compact editor overflows vertically: ${JSON.stringify(compactLayout)}`);
  assert.deepEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join(" | ")}`);
  const toolbarState = await page.locator(".editor-command-toolbar").evaluate((toolbar) => Object.fromEntries([".toolbar-brand-button", ".editor-menu-bar", ".project-name", ".toolbar-actions"].map((selector) => {
    const element = toolbar.querySelector(selector); const style = element ? getComputedStyle(element) : null; const rect = element?.getBoundingClientRect();
    return [selector, { text: element?.textContent?.trim(), display: style?.display, visibility: style?.visibility, opacity: style?.opacity, color: style?.color, rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null }];
  })));
  console.log(JSON.stringify({ editorLoaded: true, timelineSpans: await page.locator(".timeline-layer-span").count(), wideLayout, compactLayout, toolbarState, consoleErrors }, null, 2));
  await browser.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
