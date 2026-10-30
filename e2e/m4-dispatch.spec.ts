import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("M4 dispatch & return", () => {
  test("challan from approved PO → issue → dispatch → partial receipt by scan", async ({ page }) => {
    await login(page, "gauge1@demoauto.test");
    // Baseline: other seeded instruments may already be out at labs
    const atVendorTile = page.getByRole("link", { name: /At vendor/ });
    const baseline = Number(((await atVendorTile.locator("[class*=text-3xl]").textContent()) ?? "0").replace(/\D/g, ""));

    // Seeded: an approved 12-instrument PO waiting for a challan
    await page.goto("/dispatch");
    const ready = page.getByTestId("ready-pos");
    await expect(ready).toContainText("12 instruments ready");
    await ready.getByRole("link", { name: "Create delivery challan" }).first().click();

    await expect(page.getByTestId("challan-lines").getByRole("checkbox", { checked: true })).toHaveCount(12);
    await page.getByTestId("save-challan").click();
    await expect(page.getByRole("heading", { name: "Draft — numbered on issue" })).toBeVisible();

    await page.getByTestId("issue-challan").click();
    const heading = page.getByRole("heading", { name: /^DCPLT1\/\d{4}\/\d{4}$/ });
    await expect(heading).toBeVisible();
    const challanNo = ((await heading.textContent()) ?? "").trim();
    expect(((await heading.textContent()) ?? "").length).toBeLessThanOrEqual(16); // Rule 55

    const pdf = await page.request.get((await page.getByTestId("challan-pdf").getAttribute("href"))!);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");

    await page.getByTestId("dispatch-challan").click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#mode").click();
    await page.getByRole("option", { name: "Vehicle" }).click();
    await dialog.getByLabel("Vehicle no.").fill("mh 14 ab 1234");
    await dialog.getByTestId("confirm-dispatch").click();
    await expect(page.getByText(/Dispatched — gate pass GP\/PLT1\//)).toBeVisible();
    await expect(page.getByTestId("gate-pass-pdf")).toBeVisible();
    await expect(page.getByText("MH14AB1234")).toBeVisible();

    // Receive 7 of 12 by scanning codes at the receipt desk
    const codes = await page.getByTestId("challan-items").locator("tbody a[href^='/instruments/']").allTextContents();
    expect(codes).toHaveLength(12);
    const challanUrl = page.url();
    await page.goto("/dispatch/receive");
    const scan = page.getByTestId("scan-input");
    for (const code of codes.slice(0, 7)) {
      await scan.fill(code.trim());
      await scan.press("Enter");
      await expect(page.getByTestId("scan-log").locator("li").first()).toContainText(`${code.trim()} received`);
    }
    await expect(page.getByTestId("pending-returns").locator("tbody tr").filter({ hasText: challanNo })).toHaveCount(5);

    await page.goto(challanUrl);
    await expect(page.getByText("Partially returned")).toBeVisible();

    // The 5 still out show in the at-vendor aging on the dashboard
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: /At vendor/ }).locator("[class*=text-3xl]")).toHaveText(String(baseline + 5));
  });
});
