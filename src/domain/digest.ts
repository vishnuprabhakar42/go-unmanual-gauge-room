/**
 * Daily digest composition (pure). Who gets what:
 *  - GAUGE_INCHARGE: overdue, due this week and overdue returns for their plants
 *  - QUALITY_HEAD (or ORG_ADMIN when the org has no quality head): the same for their plants, plus
 *    escalations — instruments overdue by more than ESCALATION_DAYS
 * A user with several such roles gets one digest covering the union of their plants.
 */
import type { Role } from "./rbac";

export const ESCALATION_DAYS = 7;
export const DUE_THIS_WEEK_DAYS = 7;
/** Until challans exist (M4), an instrument at vendor longer than this counts as an overdue return. */
export const DEFAULT_RETURN_DAYS = 30;
export const DIGEST_LIST_LIMIT = 15;

export type DigestMember = {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  plantId: string | null;
};
export type DigestRecipient = {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  /** null = all plants */
  plantIds: string[] | null;
  escalations: boolean;
};

export function digestRecipients(members: readonly DigestMember[]): DigestRecipient[] {
  const hasQualityHead = members.some((m) => m.role === "QUALITY_HEAD");
  const relevant = members.filter(
    (m) => m.role === "GAUGE_INCHARGE" || m.role === "QUALITY_HEAD" || (!hasQualityHead && m.role === "ORG_ADMIN"),
  );
  const byUser = new Map<string, DigestRecipient>();
  for (const m of relevant) {
    const r = byUser.get(m.userId) ?? {
      userId: m.userId,
      name: m.name,
      email: m.email,
      phone: m.phone,
      plantIds: [],
      escalations: false,
    };
    if (m.plantId === null) r.plantIds = null;
    else if (r.plantIds !== null && !r.plantIds.includes(m.plantId)) r.plantIds.push(m.plantId);
    if (m.role !== "GAUGE_INCHARGE") r.escalations = true;
    byUser.set(m.userId, r);
  }
  return [...byUser.values()];
}

export type DigestInstrument = {
  code: string;
  type: string;
  plantId: string;
  plantCode: string;
  /** days until due (negative = overdue) */
  days: number;
  /** days at vendor (returns) */
  atVendorDays?: number;
};

export type DigestContent = {
  overdue: DigestInstrument[];
  dueThisWeek: DigestInstrument[];
  returnsOverdue: DigestInstrument[];
  escalated: DigestInstrument[];
};

export function digestFor(
  recipient: DigestRecipient,
  data: {
    overdue: readonly DigestInstrument[];
    dueThisWeek: readonly DigestInstrument[];
    returnsOverdue: readonly DigestInstrument[];
  },
): DigestContent {
  const mine = (i: DigestInstrument) => recipient.plantIds === null || recipient.plantIds.includes(i.plantId);
  const overdue = data.overdue.filter(mine).sort((a, b) => a.days - b.days);
  return {
    overdue,
    dueThisWeek: data.dueThisWeek.filter(mine).sort((a, b) => a.days - b.days),
    returnsOverdue: data.returnsOverdue.filter(mine).sort((a, b) => (b.atVendorDays ?? 0) - (a.atVendorDays ?? 0)),
    escalated: recipient.escalations ? overdue.filter((i) => -i.days > ESCALATION_DAYS) : [],
  };
}

export function isEmptyDigest(c: DigestContent): boolean {
  return c.overdue.length + c.dueThisWeek.length + c.returnsOverdue.length + c.escalated.length === 0;
}
