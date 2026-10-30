import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Instrument master: standard, adjustable, planning date, history", () => {
  test("admin sets planning lead, standard and adjustability; list and history reflect them", async ({ page }) => {
    await login(page, "admin@demoauto.test");
    await page.goto("/instruments?q=C-VC-001");
    await page.getByRole("link", { name: "C-VC-001", exact: true }).click();
    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByLabel("Calibration standard").fill("IS 3651 (Part 1)");
    await page.getByLabel("Standard date / edition").fill("2009-06-01");
    await page.getByLabel("Plan N days before due").fill("45");
    await expect(page.getByTestId("planning-preview")).toContainText("45 days before the due date");
    await page.getByRole("combobox", { name: /Adjustable/ }).click();
    await page.getByRole("option", { name: "Non-adjustable" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "C-VC-001" })).toBeVisible();
    await expect(page.getByText("45 days before due (set on this instrument)")).toBeVisible();
    await expect(page.getByText("IS 3651 (Part 1) (01-06-2009)")).toBeVisible();

    await page.goto("/instruments?q=C-VC-001");
    const row = page.locator("tbody tr").first();
    await expect(row).toContainText("IS 3651 (Part 1)");
    await expect(row).toContainText("No"); // non-adjustable
    await row.getByRole("link", { name: "History", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Calibration history — C-VC-001" })).toBeVisible();
    await expect(page.getByTestId("history-summary")).toBeVisible();
    const xlsx = await page.request.get((await page.getByTestId("history-export").getAttribute("href"))!);
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  });

  test("only admins can override the planning lead time", async ({ page }) => {
    await login(page, "gauge1@demoauto.test");
    await page.goto("/instruments?q=C-VC-002");
    await page.getByRole("link", { name: "C-VC-002", exact: true }).click();
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page.getByLabel("Plan N days before due")).toBeDisabled();
    await expect(page.getByText("Set by an admin.")).toBeVisible();
  });
});
