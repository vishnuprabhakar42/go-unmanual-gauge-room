import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("M2 due planning", () => {
  test("gauge in-charge raises a calibration request from the due list", async ({ page }) => {
    await login(page, "gauge1@demoauto.test");
    await page.goto("/due");
    const rowChecks = page.getByRole("checkbox", { name: /^Select (?!all on page)/ });
    await expect(rowChecks.first()).toBeVisible();
    // gauge1 is limited to PLT1 (Chakan) — no Hosur codes
    await expect(page.locator("a[href^='/instruments/']").filter({ hasText: /^H-/ })).toHaveCount(0);

    const codes = await page
      .locator("tbody a[href^='/instruments/']:not([href$='/history'])")
      .evaluateAll((as) => as.slice(0, 2).map((a) => a.textContent!.trim()));
    await rowChecks.nth(0).click();
    await rowChecks.nth(1).click();
    await page.getByTestId("create-request").click();
    await page.getByRole("dialog").getByRole("button", { name: "Create calibration request" }).click();

    await expect(page).toHaveURL(/\/requests\/c/);
    await expect(page.getByRole("heading", { name: /^CR\/PLT1\/\d\d-\d\d\/\d{4}$/ })).toBeVisible();
    const items = page.getByTestId("request-items");
    for (const code of codes) await expect(items).toContainText(code);

    // Requested instruments drop off the due list (until the request is cancelled)
    await page.goto(`/due?q=${encodeURIComponent(codes[0])}`);
    await expect(page.getByText("Nothing due right now")).toBeVisible();
    await page.goto(`/due?q=${encodeURIComponent(codes[0])}&open=1`);
    await expect(page.getByRole("link", { name: codes[0] })).toBeVisible();
  });

  test("dashboard counts change immediately after recording a calibration", async ({ page }) => {
    await login(page, "admin@demoauto.test");
    const overdueTile = page.getByTestId("kpi-overdue");
    const before = Number((await overdueTile.textContent())!.replace(/,/g, ""));
    expect(before).toBeGreaterThan(0);

    await page.goto("/due?due=OVERDUE&open=1");
    await page.locator("tbody a[href^='/instruments/']").first().click();
    await page.getByRole("link", { name: "Edit" }).click();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    await page.getByLabel("Last calibrated").fill(today);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Changes saved")).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByTestId("kpi-overdue")).toHaveText(String(before - 1));
  });

  test("due-by-month bars drill down to the due list", async ({ page }) => {
    await login(page, "quality@demoauto.test");
    await page.getByRole("link", { name: /^Overdue: / }).click();
    await expect(page).toHaveURL(/\/due\?due=OVERDUE/);
    await expect(page.locator("[data-due=OVERDUE]").first()).toBeVisible();
  });
});
