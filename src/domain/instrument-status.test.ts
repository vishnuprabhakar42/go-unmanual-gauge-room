import { describe, expect, it } from "vitest";
import {
  INSTRUMENT_STATUSES,
  INSTRUMENT_TRANSITIONS,
  InvalidTransitionError,
  MANUAL_TRANSITIONS,
  canTransition,
  isTerminal,
  transitionInstrument,
} from "./instrument-status";

describe("instrument status machine", () => {
  it("follows the calibration loop", () => {
    const path = ["IN_USE", "AWAITING_DISPATCH", "AT_VENDOR", "RECEIVED_PENDING_VERIFICATION", "IN_STORE"] as const;
    let from: (typeof INSTRUMENT_STATUSES)[number] = "IN_STORE";
    for (const to of path) {
      expect(transitionInstrument({ from, to }).status).toBe(to);
      from = to;
    }
  });

  it("routes failed verification to OOT hold, then store or scrap", () => {
    expect(canTransition("RECEIVED_PENDING_VERIFICATION", "ON_HOLD_OOT")).toBe(true);
    expect(canTransition("ON_HOLD_OOT", "IN_STORE")).toBe(true);
    expect(canTransition("ON_HOLD_OOT", "SCRAPPED")).toBe(true);
  });

  it("rejects shortcuts", () => {
    expect(() => transitionInstrument({ from: "IN_STORE", to: "AT_VENDOR" })).toThrow(InvalidTransitionError);
    expect(() => transitionInstrument({ from: "AT_VENDOR", to: "IN_STORE" })).toThrow(InvalidTransitionError);
    expect(() => transitionInstrument({ from: "IN_USE", to: "SCRAPPED" })).toThrow(InvalidTransitionError);
    expect(() => transitionInstrument({ from: "IN_STORE", to: "IN_STORE" })).toThrow(/Already/);
  });

  it("allows LOST from any non-terminal status, with a reason", () => {
    for (const s of INSTRUMENT_STATUSES.filter((x) => !isTerminal(x))) {
      expect(canTransition(s, "LOST")).toBe(true);
    }
    expect(() => transitionInstrument({ from: "IN_USE", to: "LOST" })).toThrow(/reason is required/);
    expect(transitionInstrument({ from: "IN_USE", to: "LOST", reason: " Not found in audit " }).payload.reason).toBe(
      "Not found in audit",
    );
  });

  it("treats SCRAPPED and LOST as terminal", () => {
    expect(INSTRUMENT_TRANSITIONS.SCRAPPED).toEqual([]);
    expect(INSTRUMENT_TRANSITIONS.LOST).toEqual([]);
  });

  it("manual transitions are a subset of the machine", () => {
    for (const [from, tos] of Object.entries(MANUAL_TRANSITIONS)) {
      for (const to of tos ?? []) expect(canTransition(from as never, to)).toBe(true);
    }
  });
});
