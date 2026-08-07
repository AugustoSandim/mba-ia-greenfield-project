import { expect, test } from "./fixtures";

test.describe("studio-navigation", () => {
  test("logs in and reaches the studio surfaces", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email address").fill("user@example.com");
    await page.getByLabel("Password", { exact: true }).fill("secret123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect
      .poll(async () =>
        (await page.context().cookies()).some((cookie) => cookie.name.includes("session"))
      )
      .toBe(true);

    await page.goto("/studio/videos");
    await expect(page.getByRole("heading", { name: "Studio dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Upload video" })).toBeVisible();

    await page.getByRole("link", { name: "Upload video" }).click();
    await expect(page).toHaveURL(/\/studio\/videos\/upload$/);
    await expect(page.getByRole("heading", { name: "Upload" })).toBeVisible();

    await page.getByRole("link", { name: "Channel" }).click();
    await expect(page).toHaveURL(/\/studio\/channel$/);
    await expect(page.getByRole("heading", { name: "Channel settings" })).toBeVisible();
  });
});
