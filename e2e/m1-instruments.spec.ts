import path from "node:path";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("M1 instrument register", () => {
  test("gauge in-charge imports a messy sheet, then works with an instrument", async ({ page }) => {
    await login(page, "gauge1@demoauto.test");

    // Seeded register is listed, overdue filter works
    await page.goto("/instruments?due=OVERDUE");
    await expect(page.locator("[data-due=OVERDUE]").first()).toBeVisible();
    await expect(page.locator("[data-due=OK]")).toHaveCount(0);

    // Import wizard: upload → auto-mapped columns → dry run with row errors → import
    await page.goto("/instruments/import");
    await page.getByTestId("import-file").setInputFiles(path.join(import.meta.dirname, "fixtures/small-register.xlsx"));
    await expect(page.getByText(/header found on row 2/)).toBeVisible();
    await expect(page.getByTestId("map-1")).toContainText("Instrument code");
    await expect(page.getByTestId("map-10")).toContainText("Last calibration date");
    await page.getByRole("button", { name: "Check rows" }).click();
    const summary = page.getByTestId("dry-run-summary");
    await expect(summary).toContainText("41"); // 40 rows + the "new type" row
    const issues = page.getByTestId("issues-table");
    await expect(issues).toContainText("Instrument code is missing");
    await expect(issues).toContainText("Not a real calendar date");
    await expect(issues).toContainText("Duplicate code");
    await page.getByRole("button", { name: /Import 41 instruments/ }).click();
    await expect(page.getByTestId("import-outcome")).toContainText("41 created, 0 updated, 3 skipped");

    // Find the imported instrument and open it
    await page.goto("/instruments?q=GR-00007");
    await page.getByRole("link", { name: "GR-00007", exact: true }).click();
    await expect(page.getByRole("heading", { name: "GR-00007" })).toBeVisible();
    await expect(page.getByTestId("history")).toContainText("Imported from small-register.xlsx");

    // Status change through the state machine, recorded in history
    await page.getByRole("button", { name: "Change status" }).click();
    const target = (await page.getByRole("menuitem", { name: "Issue for use" }).count()) ? "Issue for use" : "Return to store";
    await page.getByRole("menuitem", { name: target }).click();
    await expect(page.getByText("Status updated")).toBeVisible();
    await expect(page.getByTestId("history")).toContainText("Status changed");

    // QR page shows the status card
    const qrHref = await page.getByRole("link", { name: "Open QR page" }).getAttribute("href");
    await page.goto(qrHref!);
    await expect(page.getByTestId("qr-card")).toContainText("GR-00007");

    // Label PDF and Excel export
    await page.goto("/instruments?q=GR-0000");
    await page.getByRole("checkbox", { name: "Select GR-00001" }).click();
    await page.getByRole("checkbox", { name: "Select GR-00002" }).click();
    await expect(page.getByTestId("bulk-bar")).toContainText("2 selected");
    const ids = await page
      .locator("a[href^='/instruments/c']")
      .evaluateAll((as) => as.slice(0, 2).map((a) => a.getAttribute("href")!.split("/").pop()));
    const pdf = await page.request.post("/api/instruments/labels", {
      form: { ids: ids.join(","), size: "38x25", layout: "roll" },
    });
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
    const xlsx = await page.request.get("/api/instruments/export?q=GR-");
    expect(xlsx.headers()["content-disposition"]).toContain(".xlsx");
  });

  test("adding an instrument computes next due from last calibration", async ({ page }) => {
    await login(page, "gauge1@demoauto.test");
    await page.goto("/instruments/new");
    await page.getByLabel("Code").fill("C-NEW-001");
    await page.locator("#typeId").click();
    await page.getByRole("option", { name: "Outside Micrometer 0–25 mm" }).click();
    await page.getByLabel("Last calibrated").fill("2026-01-15");
    await expect(page.getByTestId("computed-due")).toHaveText("15-01-2027");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "C-NEW-001" })).toBeVisible();
    await expect(page.getByText("15-01-2027")).toBeVisible();
  });

  test("operators can view but not change instruments", async ({ page }) => {
    await login(page, "operator@demoauto.test");
    await page.goto("/instruments");
    await expect(page.getByRole("link", { name: "Add instrument" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Import from Excel" })).toHaveCount(0);
    await page.goto("/instruments/import");
    await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  });
});
