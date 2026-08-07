import { expect, test } from "./fixtures";

test.describe("home-watch", () => {
  test("renders the home feed and navigates to a watch page", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Discover videos" })).toBeVisible();
    await expect(page.getByLabel("Search videos")).toBeVisible();
    await expect(page.getByRole("link", { name: /Building a StreamTube upload pipeline/i })).toBeVisible();

    await page.getByRole("link", { name: /Building a StreamTube upload pipeline/i }).click();

    await expect(page).toHaveURL(/\/watch\/streamtube-home-1$/);
    await expect(page.getByRole("heading", { name: /Building a StreamTube upload pipeline/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Like/i })).toBeVisible();
    await expect(page.locator("video")).toBeVisible();
  });

  test("submits a navbar search to the dedicated search page", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Search videos").fill("lofi");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page).toHaveURL(/\/search\?q=lofi$/);
    await expect(page.getByRole("heading", { name: "Search results" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Lofi coding session/i })).toBeVisible();
  });
});
