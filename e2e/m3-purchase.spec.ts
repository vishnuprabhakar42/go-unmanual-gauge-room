import { expect, test, type Browser, type Page } from "@playwright/test";
import { login } from "./helpers";

async function as(browser: Browser, email: string): Promise<Page> {
  const ctx = await browser.newContext({ timezoneId: "Asia/Kolkata", locale: "en-IN" });
  const page = await ctx.newPage();
  await login(page, email);
  return page;
}

/** Gauge in-charge raises a request for instruments matching `q` and submits it; returns the request URL. */
async function raiseAndSubmit(page: Page, q: string, count: number) {
  await page.goto(`/due?q=${encodeURIComponent(q)}&due=OK`);
  const checks = page.getByRole("checkbox", { name: /^Select (?!all on page)/ });
  await expect(checks.first()).toBeVisible();
  for (let i = 0; i < count; i++) await checks.nth(i).click();
  await page.getByTestId("create-request").click();
  await page.getByRole("dialog").getByRole("button", { name: "Create calibration request" }).click();
  await expect(page).toHaveURL(/\/requests\/c/);
  await page.getByTestId("submit-request").click();
  await expect(page.getByText("Request submitted")).toBeVisible();
  return page.url();
}

test.describe("M3 vendors & purchase", () => {
  test("contract path: submit → approve → release → approve PO → PDF → send", async ({ browser }) => {
    const gauge = await as(browser, "gauge1@demoauto.test");
    const url = await raiseAndSubmit(gauge, "C-VC-", 3);
    await expect(gauge.getByTestId("sourcing-summary")).toContainText("Rate contracts: 3 · RFQ: 0");
    await expect(gauge.getByTestId("request-items")).toContainText("Precision Calibration Labs Pvt Ltd");

    const qh = await as(browser, "quality@demoauto.test");
    await qh.goto(url);
    await qh.getByTestId("approve-request").click();
    await expect(qh.getByText("Request approved")).toBeVisible();

    const purchase = await as(browser, "purchase@demoauto.test");
    await purchase.goto("/purchase/orders");
    await expect(purchase.getByTestId("ready-to-release")).toBeVisible();
    await purchase.goto(url);
    await purchase.getByTestId("release-request").click();
    await expect(purchase.getByText(/1 draft PO created/)).toBeVisible();
    await purchase
      .getByTestId("linked-docs")
      .getByRole("link", { name: /^PO\/PLT1\// })
      .click();

    await expect(purchase.getByRole("heading", { name: /^PO\/PLT1\/\d\d-\d\d\/\d{4}$/ })).toBeVisible();
    await expect(purchase.getByTestId("po-totals")).toContainText("₹1,593.00"); // 3 × ₹450 + 18% GST (intra-state)
    await purchase.getByRole("button", { name: "Approve" }).click();
    await expect(purchase.getByText("PO approved")).toBeVisible();

    const pdfHref = await purchase.getByTestId("po-pdf").getAttribute("href");
    const pdf = await purchase.request.get(pdfHref!);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");

    await purchase.getByRole("button", { name: "Send to lab" }).click();
    await expect(purchase.getByText("PO sent to 1 contact")).toBeVisible();
    await expect(purchase.getByText("Sent", { exact: true })).toBeVisible();
  });

  test("RFQ path: no contract → RFQ → quote → technical OK → award → PO", async ({ browser }) => {
    const gauge = await as(browser, "gauge1@demoauto.test");
    const url = await raiseAndSubmit(gauge, "C-TW-", 2);
    await expect(gauge.getByTestId("sourcing-summary")).toContainText("RFQ: 2");

    const qh = await as(browser, "quality@demoauto.test");
    await qh.goto(url);
    await qh.getByTestId("approve-request").click();
    await expect(qh.getByText("Request approved")).toBeVisible();

    const purchase = await as(browser, "purchase@demoauto.test");
    await purchase.goto(url);
    await purchase.getByTestId("release-request").click();
    await expect(purchase.getByText(/No POs and RFQ RFQ\/PLT1\//)).toBeVisible();
    await purchase
      .getByTestId("linked-docs")
      .getByRole("link", { name: /^RFQ\/PLT1\// })
      .click();
    await expect(purchase).toHaveURL(/\/purchase\/rfqs\/c/);
    const rfqUrl = purchase.url();

    // Metro Metrology's scope covers torque, so it was invited automatically
    await expect(purchase.getByTestId("rfq-vendors")).toContainText("Metro Metrology Services");
    await purchase.getByTestId("enter-quote-Metro Metrology Services").click();
    const dialog = purchase.getByRole("dialog");
    const rates = dialog.getByRole("textbox", { name: /^Rate / });
    for (let i = 0; i < 2; i++) await rates.nth(i).fill("1100");
    await dialog.getByTestId("save-quote").click();
    await expect(purchase.getByText("Quote saved")).toBeVisible();

    // Technical review by the gauge in-charge
    await gauge.goto(rfqUrl);
    await gauge.getByRole("button", { name: "Technically OK" }).click();
    // the button disappears once the review is saved (its own label would satisfy a text check immediately)
    await expect(gauge.getByRole("button", { name: "Technically OK" })).toHaveCount(0);
    await expect(gauge.getByTestId("rfq-vendors")).toContainText("Technically OK");

    // Purchase awards (lowest eligible pre-selected) → PO
    await purchase.reload();
    await purchase.getByTestId("award").click();
    await expect(purchase).toHaveURL(/\/purchase\/orders\/c/);
    await expect(purchase.getByTestId("po-totals")).toContainText("IGST"); // Karnataka lab → Maharashtra plant
    await expect(purchase.getByTestId("po-totals")).toContainText("₹2,596.00");
  });
});
