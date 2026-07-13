import { expect, test } from "@playwright/test";

test("creates and selects a text layer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Motion canvas")).toBeVisible();
  await page.getByRole("button", { name: "text" }).click();
  await page.getByRole("button", { name: "Heading" }).click();
  await expect(page.getByText("New headline", { exact: true }).first()).toBeVisible();
});

test("plays and pauses the deterministic preview", async ({ page }) => {
  await page.goto("/");
  const preview = page.getByRole("button", { name: /Preview/ });
  await preview.click();
  await expect(page.getByRole("button", { name: /Pause/ })).toBeVisible();
  await page.getByRole("button", { name: /Pause/ }).click();
});

test("downloads a validated Kurogi project backup", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Motion canvas")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Backup" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.kurogi\.json$/);
  await expect(page.getByRole("status")).toContainText("Project backup exported");
});
