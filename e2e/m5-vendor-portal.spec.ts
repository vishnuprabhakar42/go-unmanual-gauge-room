import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const pdf = (name: string) => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from(`%PDF-1.4\n% ${name}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF`),
});

async function labLogin(page: Page) {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Email").fill("lab@precisioncal.test");
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/vendor$/); // lab staff land in the portal, never the internal app
}

test.describe("M5 vendor portal", () => {
  test("lab acknowledges a PO, updates a job and bulk-uploads certificates", async ({ page }) => {
    await labLogin(page);
    await expect(page.getByTestId("portal-tiles")).toBeVisible();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/vendor$/);

    // PO sent by Demo Auto (seeded) → acknowledge
    await page.goto("/vendor/orders");
    await page.getByTestId("portal-orders").getByRole("link").first().click();
    await page.getByTestId("acknowledge-po").click();
    await expect(page.getByText("PO acknowledged")).toBeVisible();
    const pdfRes = await page.request.get((await page.getByTestId("portal-po-pdf").getAttribute("href"))!);
    expect(pdfRes.headers()["content-type"]).toBe("application/pdf");

    // Jobs: mark one in-transit instrument received at the lab
    await page.goto("/vendor/jobs");
    const jobs = page.getByTestId("lab-jobs");
    await jobs
      .getByRole("button", { name: /^Mark received / })
      .first()
      .click();
    await expect(page.getByText("Updated")).toBeVisible();
    await expect(jobs).toContainText("Received at lab");

    // Certificates: files named by instrument code auto-match; an unrelated scan needs manual matching
    // Only jobs still waiting for a certificate (seeded pressure gauges already have theirs)
    const pendingRows = jobs.locator("tbody tr").filter({ hasText: "Pending" });
    const codes = (await pendingRows.locator("td:first-child .font-mono").allTextContents()).map((c) => c.trim());
    expect(codes.length).toBeGreaterThanOrEqual(8);
    await page.goto("/vendor/certificates");
    await page
      .getByTestId("cert-files")
      .setInputFiles([...codes.map((c, i) => pdf(i % 2 ? `Cert_${c.replace(/-/g, "_")}.pdf` : `${c}.pdf`)), pdf("scan0001.pdf")]);
    const table = page.getByTestId("cert-matches");
    await expect(table.locator("[data-match=code]")).toHaveCount(codes.length);
    await expect(table.locator("[data-match=unmatched]")).toHaveCount(1);
    await page.getByTestId("upload-certs").click();
    await expect(page.getByText(`${codes.length} certificates uploaded`)).toBeVisible();
    await expect(table.locator("tr[data-state=done]")).toHaveCount(codes.length);
  });

  test("the customer sees the uploaded certificate through a signed link", async ({ page }) => {
    await login(page, "gauge1@demoauto.test");
    await page.goto("/dispatch/lab-jobs");
    const row = page.getByTestId("lab-jobs").locator("tbody tr").filter({ hasText: "View" }).first();
    const href = await row.getByRole("link", { name: /View/ }).getAttribute("href");
    const res = await page.request.get(href!, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const signed = res.headers()["location"];
    expect(signed).toMatch(/\/api\/files\/.+sig=/);
    const file = await page.request.get(signed);
    expect(file.headers()["content-type"]).toBe("application/pdf");
    const tampered = await page.request.get(signed.replace(/sig=[^&]+/, "sig=forged"));
    expect(tampered.status()).toBe(403);

    // Internal users can't open the lab portal
    await page.goto("/vendor");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
