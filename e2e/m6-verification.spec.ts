import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const todayIST = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

async function fillCertificate(page: Page, certificateNo: string, readings: string) {
  await page.getByLabel("Certificate no.").fill(certificateNo);
  await page.getByLabel("ULR no.").fill("CC245126000410001F");
  await page.getByLabel("Calibration date").fill(todayIST());
  await page.getByLabel("Lab accreditation no. on certificate").fill("CC-2451");
  await page
    .getByRole("radiogroup", { name: "NABL mark / ULR shown on certificate" })
    .getByRole("radio", { name: "Yes" })
    .click();
  await page.getByRole("radiogroup", { name: "Measurement uncertainty stated" }).getByRole("radio", { name: "Yes" }).click();
  await page.getByRole("button", { name: "Paste readings" }).click();
  await page.getByRole("textbox", { name: "Paste readings" }).fill(readings);
  await page.getByRole("button", { name: "Replace readings" }).click();
}

async function openVerification(page: Page, code: string) {
  await page.goto("/verification");
  await page.getByRole("link", { name: `Verify ${code}` }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(code);
  await expect(page.locator("iframe")).toHaveAttribute("src", /\/api\/attachments\//);
}

test.describe("M6 certificate verification and OOT", () => {
  test("gauge in-charge passes one certificate and fails another; quality head dispositions the OOT", async ({ page }) => {
    await login(page, "gauge1@demoauto.test");
    await page.goto("/verification");
    const queue = page.getByTestId("verification-queue");
    const codes = (await queue.locator("tbody tr td:first-child .font-mono").allTextContents())
      .map((c) => c.trim())
      .filter((c) => c.includes("PRG"))
      .sort();
    expect(codes.length).toBeGreaterThanOrEqual(2);
    const [passCode, failCode] = [codes[0], codes[codes.length - 1]];

    // PASS: manual entry, the checklist must be complete before deciding
    await openVerification(page, passCode);
    const decide = page.getByRole("button", { name: "Record PASS" });
    await expect(decide).toBeDisabled();
    await fillCertificate(page, "PCL/E2E/0001", "0\t0.02\t0.1\n5\t5.05\t0.1\n10\t9.96\t0.1");
    await expect(page.getByTestId("checklist").locator("[data-status=pending]")).toHaveCount(0);
    await expect(page.getByTestId("computed-result")).toContainText("Pass");
    await decide.click();
    await expect(page.getByText(`${passCode} passed`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Print a new calibration label?" })).toBeVisible();
    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page).toHaveURL(/\/verification$/);
    await expect(page.getByTestId("recent-verifications")).toContainText(passCode);
    await expect(queue).not.toContainText(passCode);

    // FAIL: one point out of tolerance → OOT case, instrument on hold
    await openVerification(page, failCode);
    await fillCertificate(
      page,
      "PCL/E2E/0002",
      "0 bar\t0\t0.03\t0.02\t0.1\t0.02\n5 bar\t5\t5.08\t5.05\t0.1\t0.02\n10 bar\t10\t10.27\t10.18\t0.1\t0.02",
    );
    await expect(page.getByTestId("readings-grid").locator("tbody tr").nth(2)).toContainText("Fail");
    await page.getByRole("button", { name: "Record FAIL & open OOT" }).click();
    await expect(page).toHaveURL(/\/verification\/oot\/.+/);
    const caseUrl = page.url();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(failCode);
    await expect(page.getByText("On hold (OOT)")).toBeVisible();
    await expect(page.getByLabel("Last good calibration")).not.toHaveValue("");
    await expect(page.getByText("Only the quality head can decide")).toHaveCount(0); // still OPEN
    await page.getByLabel("Impact notes").fill("Used on Line 3 clamp pressure checks; reads 0.18 bar high at 10 bar");
    await page.getByLabel("Affected products / lots").fill("Bracket 44-102, lots 2610-2614");
    await page.getByRole("button", { name: "Save assessment" }).click();
    await expect(page.getByText("Assessment saved")).toBeVisible();
    await expect(page.getByText("Only the quality head can decide the disposition.")).toBeVisible();

    // Quality head decides and closes
    await page.context().clearCookies();
    await login(page, "quality@demoauto.test");
    await page.goto(caseUrl);
    await page.getByLabel("Repair then recalibrate").check();
    await page.getByLabel("Reason").fill("Re-zero and recalibrate; affected lots re-inspected");
    await page.getByRole("button", { name: "Record decision" }).click();
    await expect(page.getByTestId("oot-decision")).toContainText("Repair then recalibrate");
    await expect(page.getByTestId("oot-decision")).toContainText("Rajesh Kulkarni");
    await page.getByLabel("CAPA / NC reference (optional)").fill("CAPA-26-014");
    await page.getByRole("button", { name: "Close case" }).click();
    await expect(page.getByText("CAPA CAPA-26-014")).toBeVisible();
  });

  test("a defective certificate is rejected back to the lab", async ({ page }) => {
    await login(page, "gauge1@demoauto.test");
    await page.goto("/verification");
    const row = page.getByTestId("verification-queue").locator("tbody tr").first();
    const code = (await row.locator("td:first-child .font-mono").textContent())!.trim();
    await openVerification(page, code);
    await page.getByLabel("Lab accreditation no. on certificate").fill("CC-9999");
    await expect(page.getByText(/The certificate itself has problems/)).toBeVisible();
    await page.getByRole("button", { name: "Reject certificate" }).click();
    await page.getByLabel("What's wrong?").fill("Accreditation number on the certificate doesn't match the lab");
    await page.getByRole("button", { name: "Reject and notify lab" }).click();
    await expect(page).toHaveURL(/\/verification$/);
    await expect(page.getByTestId("verification-queue").or(page.getByText("No certificates waiting"))).not.toContainText(code);
  });
});
