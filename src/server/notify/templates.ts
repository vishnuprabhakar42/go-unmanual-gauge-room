/**
 * Notification templates. Each renders email and/or WhatsApp content from a typed payload.
 * Add new templates here; the Notifier and worker look them up by key.
 */
import { z } from "zod";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const digestLine = z.object({ code: z.string(), type: z.string(), plant: z.string(), note: z.string() });

type Rendered = {
  email?: { subject: string; text: string; html: string };
  whatsapp?: { template: string; params: string[]; preview: string };
};

function def<S extends z.ZodType>(schema: S, render: (p: z.infer<S>) => Rendered) {
  return { schema, render };
}

export const TEMPLATES = {
  "auth.magicLink": def(z.object({ url: z.string().url(), host: z.string() }), (p) => ({
    email: {
      subject: "Your Go Unmanual sign-in link",
      text: `Sign in to Go Unmanual Gauge Room:\n${p.url}\n\nThis link expires in 24 hours. If you did not request it, ignore this email.`,
      html: `<p>Sign in to <b>Go Unmanual Gauge Room</b>:</p><p><a href="${escape(p.url)}">Sign in</a></p><p style="color:#666">This link expires in 24 hours. If you did not request it, ignore this email.</p>`,
    },
  })),
  "user.invite": def(
    z.object({ orgName: z.string(), inviterName: z.string(), role: z.string(), loginUrl: z.string().url() }),
    (p) => ({
      email: {
        subject: `You've been added to ${p.orgName} on Go Unmanual`,
        text: `${p.inviterName} added you to ${p.orgName} as ${p.role}.\nSign in with your email at ${p.loginUrl}`,
        html: `<p>${escape(p.inviterName)} added you to <b>${escape(p.orgName)}</b> as ${escape(p.role)}.</p><p><a href="${escape(p.loginUrl)}">Sign in to Go Unmanual</a></p>`,
      },
      whatsapp: {
        template: "user_invite",
        params: [p.orgName, p.role, p.loginUrl],
        preview: `You've been added to ${p.orgName} as ${p.role}. Sign in: ${p.loginUrl}`,
      },
    }),
  ),
  "digest.daily": def(
    z.object({
      orgName: z.string(),
      date: z.string(),
      recipientName: z.string(),
      appUrl: z.string().url(),
      counts: z.object({ overdue: z.number(), dueThisWeek: z.number(), returnsOverdue: z.number(), escalated: z.number() }),
      overdue: z.array(digestLine),
      dueThisWeek: z.array(digestLine),
      returnsOverdue: z.array(digestLine),
      escalated: z.array(digestLine),
    }),
    (p) => {
      const section = (title: string, total: number, lines: z.infer<typeof digestLine>[]) =>
        total === 0
          ? null
          : {
              text: `${title} (${total})\n${lines.map((l) => `  • ${l.code} — ${l.type} [${l.plant}] ${l.note}`).join("\n")}${total > lines.length ? `\n  … and ${total - lines.length} more` : ""}`,
              html: `<h3 style="margin:16px 0 4px">${escape(title)} (${total})</h3><ul style="margin:0;padding-left:18px">${lines
                .map((l) => `<li><b>${escape(l.code)}</b> — ${escape(l.type)} [${escape(l.plant)}] ${escape(l.note)}</li>`)
                .join("")}</ul>${total > lines.length ? `<p style="color:#666">… and ${total - lines.length} more</p>` : ""}`,
            };
      const sections = [
        section("Escalated: overdue more than 7 days", p.counts.escalated, p.escalated),
        section("Overdue", p.counts.overdue, p.overdue),
        section("Due this week", p.counts.dueThisWeek, p.dueThisWeek),
        section("Returns overdue from vendors", p.counts.returnsOverdue, p.returnsOverdue),
      ].filter((x): x is { text: string; html: string } => x !== null);
      const headline = `${p.counts.overdue} overdue · ${p.counts.dueThisWeek} due this week · ${p.counts.returnsOverdue} returns overdue`;
      const subject = `${p.counts.escalated ? "⚠ Escalation — " : ""}Go Unmanual daily: ${headline}`;
      return {
        email: {
          subject,
          text: `Good morning ${p.recipientName},\n\n${p.orgName} — ${p.date}\n${headline}\n\n${sections.map((x) => x.text).join("\n\n")}\n\nOpen the due list: ${p.appUrl}/due`,
          html: `<p>Good morning ${escape(p.recipientName)},</p><p><b>${escape(p.orgName)}</b> — ${escape(p.date)}<br>${escape(headline)}</p>${sections
            .map((x) => x.html)
            .join("")}<p><a href="${escape(p.appUrl)}/due">Open the due list</a></p>`,
        },
        whatsapp: {
          template: "daily_digest",
          params: [
            p.recipientName,
            p.orgName,
            String(p.counts.overdue),
            String(p.counts.dueThisWeek),
            String(p.counts.returnsOverdue),
            String(p.counts.escalated),
          ],
          preview: `${p.orgName} ${p.date}: ${headline}${p.counts.escalated ? ` · ${p.counts.escalated} escalated` : ""}. ${p.appUrl}/due`,
        },
      };
    },
  ),
  "po.sent": def(
    z.object({
      poId: z.string(),
      poNumber: z.string(),
      orgName: z.string(),
      plantName: z.string(),
      vendorName: z.string(),
      total: z.number(),
      appUrl: z.string().url(),
    }),
    (p) => ({
      email: {
        subject: `Purchase order ${p.poNumber} from ${p.orgName}`,
        text: `Dear ${p.vendorName},\n\nPlease find attached purchase order ${p.poNumber} from ${p.orgName} (${p.plantName}) for calibration services, total ₹${p.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })} incl. GST.\n\nKindly acknowledge it in the lab portal: ${p.appUrl}/vendor/orders/${p.poId}\n\nRegards,\n${p.orgName}`,
        html: `<p>Dear ${escape(p.vendorName)},</p><p>Please find attached purchase order <b>${escape(p.poNumber)}</b> from ${escape(p.orgName)} (${escape(p.plantName)}) for calibration services, total <b>₹${p.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</b> incl. GST.</p><p><a href="${escape(p.appUrl)}/vendor/orders/${escape(p.poId)}">Acknowledge in the lab portal</a></p><p>Regards,<br>${escape(p.orgName)}</p>`,
      },
    }),
  ),
  "rfq.invited": def(
    z.object({
      vendorName: z.string(),
      orgName: z.string(),
      rfqNumber: z.string(),
      dueAt: z.string(),
      portalUrl: z.string().url(),
    }),
    (p) => {
      const due = new Date(p.dueAt).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }).replace(/\//g, "-");
      return {
        email: {
          subject: `RFQ ${p.rfqNumber} from ${p.orgName} — quotes due ${due}`,
          text: `Dear ${p.vendorName},\n\n${p.orgName} invites you to quote for calibration under RFQ ${p.rfqNumber} by ${due}.\nView the instruments and submit your rates: ${p.portalUrl}\n\nRegards,\n${p.orgName}`,
          html: `<p>Dear ${escape(p.vendorName)},</p><p>${escape(p.orgName)} invites you to quote for calibration under RFQ <b>${escape(p.rfqNumber)}</b> by <b>${escape(due)}</b>.</p><p><a href="${escape(p.portalUrl)}">View the instruments and submit your rates</a></p>`,
        },
      };
    },
  ),
  "vendor.invite": def(z.object({ vendorName: z.string(), orgName: z.string(), portalUrl: z.string().url() }), (p) => ({
    email: {
      subject: `${p.orgName} invited ${p.vendorName} to the Go Unmanual lab portal`,
      text: `${p.orgName} has given you access to the Go Unmanual lab portal for ${p.vendorName}: see RFQs and purchase orders, update job status and upload certificates.\nSign in with this email at ${p.portalUrl}`,
      html: `<p>${escape(p.orgName)} has given you access to the <b>Go Unmanual lab portal</b> for ${escape(p.vendorName)}: RFQs, purchase orders, job status and certificate upload.</p><p><a href="${escape(p.portalUrl)}">Sign in with this email</a></p>`,
    },
  })),
  "oot.opened": def(
    z.object({ code: z.string(), trigger: z.enum(["AS_LEFT_FAIL", "AS_FOUND_FAIL"]), lab: z.string(), url: z.string().url() }),
    (p) => {
      const what =
        p.trigger === "AS_LEFT_FAIL"
          ? "failed calibration and is on hold"
          : "was out of tolerance as found (passed after adjustment)";
      return {
        email: {
          subject: `OOT: ${p.code} ${p.trigger === "AS_LEFT_FAIL" ? "on hold" : "— impact assessment needed"}`,
          text: `${p.code} ${what} (${p.lab}). An impact assessment and your disposition are needed: ${p.url}`,
          html: `<p><b>${escape(p.code)}</b> ${escape(what)} (${escape(p.lab)}).</p><p><a href="${escape(p.url)}">Open the OOT case</a> to review the impact assessment and decide the disposition.</p>`,
        },
        whatsapp: { template: "oot_opened", params: [p.code, what, p.url], preview: `OOT: ${p.code} ${what}. ${p.url}` },
      };
    },
  ),
  "cert.rejected": def(z.object({ code: z.string(), reason: z.string(), lab: z.string(), url: z.string().url() }), (p) => ({
    email: {
      subject: `Certificate for ${p.code} needs correction`,
      text: `Dear ${p.lab},\n\nThe calibration certificate uploaded for ${p.code} was not accepted:\n${p.reason}\n\nPlease upload a corrected certificate: ${p.url}`,
      html: `<p>Dear ${escape(p.lab)},</p><p>The calibration certificate uploaded for <b>${escape(p.code)}</b> was not accepted:</p><blockquote>${escape(p.reason)}</blockquote><p><a href="${escape(p.url)}">Upload a corrected certificate</a></p>`,
    },
  })),
  "auditpack.ready": def(
    z.object({ plant: z.string(), period: z.string(), pages: z.number().int(), url: z.string().url() }),
    (p) => ({
      email: {
        subject: `Audit pack ready: ${p.plant}, ${p.period}`,
        text: `Your calibration audit pack for ${p.plant} (${p.period}, ${p.pages} pages) is ready to download: ${p.url}`,
        html: `<p>Your calibration audit pack for <b>${escape(p.plant)}</b> (${escape(p.period)}, ${p.pages} pages) is ready.</p><p><a href="${escape(p.url)}">Download it from Reports</a></p>`,
      },
    }),
  ),
  "system.test": def(z.object({ message: z.string() }), (p) => ({
    email: { subject: "Go Unmanual test notification", text: p.message, html: `<p>${escape(p.message)}</p>` },
    whatsapp: { template: "system_test", params: [p.message], preview: p.message },
  })),
} as const;

export type TemplateKey = keyof typeof TEMPLATES;
export type TemplatePayload<K extends TemplateKey> = z.infer<(typeof TEMPLATES)[K]["schema"]>;

export function renderTemplate<K extends TemplateKey>(key: K, payload: unknown): Rendered {
  const t = TEMPLATES[key];
  const parsed = t.schema.parse(payload) as never;
  return (t.render as (p: never) => Rendered)(parsed);
}

export function isTemplateKey(key: string): key is TemplateKey {
  return key in TEMPLATES;
}
