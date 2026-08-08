import { expect, test } from "./fixtures";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("user@example.com");
  await page.getByLabel("Password", { exact: true }).fill("secret123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect
    .poll(async () =>
      (await page.context().cookies()).some((cookie) => cookie.name.includes("session"))
    )
    .toBe(true);
}

test.describe("studio-upload", () => {
  test("submits a multipart upload and lands on the edit page", async ({ page }) => {
    await login(page);
    await page.goto("/studio/videos/upload");

    await page.getByLabel("Title").fill("Playwright upload demo");
    await page.getByLabel("Video file").setInputFiles({
      name: "demo.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("fake-video-bytes-for-e2e"),
    });

    await page.getByRole("button", { name: "Start upload" }).click();
    await expect(page).toHaveURL(/\/studio\/videos\/vid-upload-\d+\/edit$/, {
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: /Edit video/i })).toBeVisible();
  });
});
