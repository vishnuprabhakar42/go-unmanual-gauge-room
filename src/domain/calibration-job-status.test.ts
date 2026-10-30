import { describe, expect, it } from "vitest";
import {
  JOB_STATUSES,
  JOB_TRANSITIONS,
  OPEN_JOB_STATUSES,
  assertJobTransition,
  canTransitionJob,
} from "./calibration-job-status";

describe("calibration job status machine", () => {
  it("follows the external calibration path", () => {
    const path = [
      "PLANNED",
      "PO_RAISED",
      "DISPATCHED",
      "AT_LAB",
      "RETURNED",
      "CERT_UPLOADED",
      "VERIFIED_PASS",
      "CLOSED",
    ] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransitionJob(path[i], path[i + 1])).toBe(true);
    expect(canTransitionJob("CERT_UPLOADED", "VERIFIED_FAIL")).toBe(true);
  });
  it("lets in-house jobs skip PO and dispatch, but not external ones", () => {
    expect(canTransitionJob("PLANNED", "CERT_UPLOADED", { inHouse: true })).toBe(true);
    expect(canTransitionJob("PLANNED", "CERT_UPLOADED")).toBe(false);
  });
  it("rejects skips and terminal moves", () => {
    expect(() => assertJobTransition("PO_RAISED", "RETURNED")).toThrow();
    expect(() => assertJobTransition("DISPATCHED", "CANCELLED")).toThrow();
    expect(JOB_TRANSITIONS.CLOSED).toEqual([]);
    expect(canTransitionJob("DISPATCHED", "RETURNED")).toBe(true); // returned without AT_LAB update
  });
  it("classifies open statuses", () => {
    expect(JOB_STATUSES.filter((s) => !OPEN_JOB_STATUSES.includes(s))).toEqual([
      "VERIFIED_PASS",
      "VERIFIED_FAIL",
      "CLOSED",
      "CANCELLED",
    ]);
  });
});
