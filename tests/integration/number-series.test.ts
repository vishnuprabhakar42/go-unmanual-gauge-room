import { describe, expect, it } from "vitest";
import { nextDocNumber } from "@/server/number-series";
import { withTenantTx } from "@/server/tenant";
import { makeOrg } from "./helpers";

describe("number series", () => {
  it("issues sequential numbers per plant, doc type and FY", async () => {
    const org = await makeOrg("Series Org", ["PLT1", "PLT2"]);
    const [p1, p2] = org.plants;
    const date = new Date("2026-10-22T06:00:00Z");
    const issue = (plantId: string, docType: "PO" | "DC") =>
      withTenantTx(org.ctx, (tx) => nextDocNumber(tx, { plantId, docType, date }));

    expect(await issue(p1.id, "PO")).toBe("PO/PLT1/26-27/0001");
    expect(await issue(p1.id, "PO")).toBe("PO/PLT1/26-27/0002");
    expect(await issue(p2.id, "PO")).toBe("PO/PLT2/26-27/0001");
    const dc = await issue(p1.id, "DC");
    expect(dc).toBe("DCPLT1/2627/0001");
    expect(dc.length).toBeLessThanOrEqual(16);
  });

  it("starts a new series in a new financial year, carrying the template forward", async () => {
    const org = await makeOrg("FY Org", ["FY1"]);
    const n = await withTenantTx(org.ctx, (tx) =>
      nextDocNumber(tx, { plantId: org.plants[0].id, docType: "CR", date: new Date("2027-04-01T00:00:00+05:30") }),
    );
    expect(n).toBe("CR/FY1/27-28/0001");
  });

  it("never issues duplicates under concurrency", async () => {
    const org = await makeOrg("Concurrent Org", ["CC1"]);
    const date = new Date("2026-10-22T06:00:00Z");
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        withTenantTx(org.ctx, (tx) => nextDocNumber(tx, { plantId: org.plants[0].id, docType: "PO", date })),
      ),
    );
    expect(new Set(results).size).toBe(10);
    expect(results.sort().at(-1)).toBe("PO/CC1/26-27/0010");
  });

  it("does not consume a number when the transaction rolls back", async () => {
    const org = await makeOrg("Gapless Org", ["GL1"]);
    const date = new Date("2026-10-22T06:00:00Z");
    await expect(
      withTenantTx(org.ctx, async (tx) => {
        await nextDocNumber(tx, { plantId: org.plants[0].id, docType: "PO", date });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await withTenantTx(org.ctx, (tx) => nextDocNumber(tx, { plantId: org.plants[0].id, docType: "PO", date }))).toBe(
      "PO/GL1/26-27/0001",
    );
  });
});
