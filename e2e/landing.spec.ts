import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Go Unmanual landing page", () => {
  test("visitors see the marketing page and can sign in; signed-in users go to the app", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Go Unmanual/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your gauge room, unmanual.");
    await expect(page.locator("#features h3")).toHaveCount(8);
    await page.getByRole("link", { name: "Sign in", exact: true }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Sign in to Go Unmanual")).toBeVisible();

    await login(page, "admin@demoauto.test");
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
