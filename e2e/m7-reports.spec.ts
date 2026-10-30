import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("M7 audit pack and reports", () => {
  test("quality head generates an audit pack in the background and downloads it", async ({ page }) => {
    await login(page, "quality@demoauto.test");
    await page.goto("/reports");
    const packs = page.getByTestId("audit-packs");
    const before = await packs.locator("tbody tr").count();
    await page.getByRole("button", { name: "Generate audit pack" }).click();
    await expect(page.getByText("Audit pack queued")).toBeVisible();
    await expect(packs.locator("tbody tr")).toHaveCount(before + 1);
    const row = packs.locator("tbody tr").first();
    // the page refreshes itself while the worker builds the pack
    await expect(row).toHaveAttribute("data-status", "READY", { timeout: 90_000 });
    const href = await row.getByTestId("pack-download").getAttribute("href");
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("reports show live numbers and export to Excel", async ({ page }) => {
    await login(page, "quality@demoauto.test");
    await page.goto("/reports/vendors");
    await expect(page.getByTestId("vendor-performance")).toContainText("Precision Calibration Labs");
    const xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const vendors = await page.request.get((await page.getByTestId("export").getAttribute("href"))!);
    expect(vendors.headers()["content-type"]).toBe(xlsx);

    await page.getByRole("link", { name: "Calibration spend" }).click();
    await expect(page.getByTestId("spend-total")).toContainText("₹");
    await page.getByRole("link", { name: "At-vendor aging" }).click();
    await expect(page.getByTestId("aging")).toBeVisible();
    await page.getByRole("link", { name: "Registers" }).click();
    for (const id of ["export-master", "export-due"]) {
      const r = await page.request.get((await page.getByTestId(id).getAttribute("href"))!);
      expect(r.headers()["content-type"]).toBe(xlsx);
    }

    // Operators can't open reports
    await page.context().clearCookies();
    await login(page, "operator@demoauto.test");
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reports & audit pack" })).toHaveCount(0);
  });
});
