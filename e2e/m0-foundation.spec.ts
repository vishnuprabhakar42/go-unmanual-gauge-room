import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("M0 foundation", () => {
  test("admin adds a plant and a user; both appear in the audit log", async ({ page }) => {
    await login(page, "admin@demoauto.test");
    await expect(page.getByRole("heading", { name: "Welcome, Anita Deshmukh" })).toBeVisible();

    // Plants: validation then create
    await page.goto("/settings/plants");
    await expect(page.getByRole("cell", { name: "PLT1" })).toBeVisible();
    await page.getByRole("button", { name: "Add plant" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Sanand Plant");
    await dialog.getByLabel("Code").fill("plt3");
    await dialog.getByLabel(/GSTIN/).fill("24AADCD4321K1ZA");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Enter a valid 15-character GSTIN")).toBeVisible();
    await dialog.getByLabel(/GSTIN/).fill("");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("cell", { name: "PLT3" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Sanand Plant" })).toBeVisible();

    // Users: invite a plant-scoped gauge in-charge
    await page.goto("/settings/users");
    await page.getByRole("button", { name: "Add user" }).click();
    const invite = page.getByRole("dialog");
    await invite.getByLabel("Name").fill("Nitin Shah");
    await invite.getByLabel("Email").fill("nitin@demoauto.test");
    await invite.getByRole("button", { name: "Add user" }).click();
    await expect(invite).toBeHidden();
    await expect(page.getByText("nitin@demoauto.test")).toBeVisible();

    // Audit log records both, attributed to the admin
    await page.goto("/settings/audit-log");
    const table = page.getByTestId("audit-table");
    await expect(table.getByRole("row").filter({ hasText: "Plant" }).filter({ hasText: "PLT3" }).first()).toContainText(
      "Anita Deshmukh",
    );
    await expect(
      table.getByRole("row").filter({ hasText: "User" }).filter({ hasText: "nitin@demoauto.test" }).first(),
    ).toContainText("CREATE");
  });

  test("plant-scoped users only see their plant; operators cannot open settings", async ({ page }) => {
    await login(page, "operator@demoauto.test");
    await page.goto("/settings/plants");
    await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByTestId("plant-switcher")).toContainText("PLT1");
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
  });

  test("new company signs up and completes setup", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Priya Nair");
    await page.getByLabel("Email").fill(`priya+${Date.now()}@example.test`);
    await page.getByLabel("Password").fill("supersecret1");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/setup/);
    await page.getByLabel("Company name").fill("Nair Precision Pvt Ltd");
    await page.getByLabel("Plant name").fill("Coimbatore");
    await page.getByLabel("Plant code").fill("CBE1");
    await page.getByRole("button", { name: "Create company" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText("Nair Precision Pvt Ltd").first()).toBeVisible();
    // Fresh tenant sees none of the demo org's data
    await page.goto("/settings/plants");
    await expect(page.getByRole("cell", { name: "CBE1" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "PLT1" })).toHaveCount(0);
  });

  test("@mobile sidebar opens from the menu button", async ({ page }) => {
    await login(page, "gauge1@demoauto.test");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  });
});
