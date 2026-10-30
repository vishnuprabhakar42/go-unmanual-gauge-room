import { describe, expect, it } from "vitest";
import {
  OPEN_REQUEST_STATUSES,
  REQUEST_STATUSES,
  REQUEST_TRANSITIONS,
  assertRequestTransition,
  canTransitionRequest,
  isEditable,
} from "./calibration-request-status";

describe("calibration request status machine", () => {
  it("follows the happy path", () => {
    const path = ["DRAFT", "SUBMITTED", "APPROVED", "SOURCING", "PO_RAISED", "CLOSED"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransitionRequest(path[i], path[i + 1])).toBe(true);
  });
  it("allows sending back and cancelling open requests only", () => {
    expect(canTransitionRequest("SUBMITTED", "DRAFT")).toBe(true);
    for (const s of OPEN_REQUEST_STATUSES.filter((x) => x !== "PO_RAISED"))
      expect(canTransitionRequest(s, "CANCELLED")).toBe(true);
    expect(canTransitionRequest("PO_RAISED", "CANCELLED")).toBe(false);
    expect(REQUEST_TRANSITIONS.CLOSED).toEqual([]);
    expect(REQUEST_TRANSITIONS.CANCELLED).toEqual([]);
  });
  it("rejects skips", () => {
    expect(() => assertRequestTransition("DRAFT", "APPROVED")).toThrow();
    expect(() => assertRequestTransition("APPROVED", "PO_RAISED")).toThrow();
  });
  it("only drafts are editable; every status is classified", () => {
    expect(REQUEST_STATUSES.filter(isEditable)).toEqual(["DRAFT"]);
    expect(OPEN_REQUEST_STATUSES).not.toContain("CLOSED");
  });
});
