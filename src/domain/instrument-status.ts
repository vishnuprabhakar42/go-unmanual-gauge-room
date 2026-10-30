/**
 * Instrument status state machine. UI and API must call `transitionInstrument` — never set status directly.
 *
 *   IN_STORE ↔ IN_USE
 *   IN_STORE | IN_USE → AWAITING_DISPATCH → AT_VENDOR → RECEIVED_PENDING_VERIFICATION
 *   RECEIVED_PENDING_VERIFICATION → IN_STORE (pass) | ON_HOLD_OOT (fail)
 *   ON_HOLD_OOT → IN_STORE | SCRAPPED
 *   any non-terminal → LOST (reason required);  SCRAPPED, LOST are terminal
 */
export const INSTRUMENT_STATUSES = [
  "IN_STORE",
  "IN_USE",
  "AWAITING_DISPATCH",
  "AT_VENDOR",
  "RECEIVED_PENDING_VERIFICATION",
  "ON_HOLD_OOT",
  "SCRAPPED",
  "LOST",
] as const;
export type InstrumentStatus = (typeof INSTRUMENT_STATUSES)[number];

export const TERMINAL_STATUSES: readonly InstrumentStatus[] = ["SCRAPPED", "LOST"];

export const INSTRUMENT_TRANSITIONS: Readonly<Record<InstrumentStatus, readonly InstrumentStatus[]>> = {
  IN_STORE: ["IN_USE", "AWAITING_DISPATCH", "LOST"],
  IN_USE: ["IN_STORE", "AWAITING_DISPATCH", "LOST"],
  AWAITING_DISPATCH: ["AT_VENDOR", "IN_STORE", "LOST"],
  AT_VENDOR: ["RECEIVED_PENDING_VERIFICATION", "LOST"],
  RECEIVED_PENDING_VERIFICATION: ["IN_STORE", "ON_HOLD_OOT", "LOST"],
  ON_HOLD_OOT: ["IN_STORE", "SCRAPPED", "LOST"],
  SCRAPPED: [],
  LOST: [],
};

/** Transitions a person may trigger directly from the instrument page (others come from workflows). */
export const MANUAL_TRANSITIONS: Readonly<Partial<Record<InstrumentStatus, readonly InstrumentStatus[]>>> = {
  IN_STORE: ["IN_USE", "LOST"],
  IN_USE: ["IN_STORE", "LOST"],
  AWAITING_DISPATCH: ["LOST"],
  AT_VENDOR: ["LOST"],
  RECEIVED_PENDING_VERIFICATION: ["LOST"],
  ON_HOLD_OOT: ["LOST"],
};

export function canTransition(from: InstrumentStatus, to: InstrumentStatus): boolean {
  return INSTRUMENT_TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: InstrumentStatus,
    public readonly to: InstrumentStatus,
    reason?: string,
  ) {
    super(reason ?? `Cannot change status from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export type TransitionInput = { from: InstrumentStatus; to: InstrumentStatus; reason?: string | null };

/** Validates a transition and returns the event payload to record. */
export function transitionInstrument(input: TransitionInput): {
  status: InstrumentStatus;
  payload: { from: InstrumentStatus; to: InstrumentStatus; reason: string | null };
} {
  const { from, to } = input;
  if (from === to) throw new InvalidTransitionError(from, to, `Already ${to}`);
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
  const reason = input.reason?.trim() || null;
  if (to === "LOST" && !reason) throw new InvalidTransitionError(from, to, "A reason is required to mark an instrument lost");
  return { status: to, payload: { from, to, reason } };
}

export function isTerminal(status: InstrumentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
