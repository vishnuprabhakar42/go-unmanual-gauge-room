import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/env";
import type { EmailMessage, EmailProvider } from "./types";

export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  private transport: Transporter;
  constructor(
    private readonly from: string,
    opts: { host: string; port: number; user?: string; password?: string },
  ) {
    this.transport = nodemailer.createTransport({
      host: opts.host,
      port: opts.port,
      secure: opts.port === 465,
      auth: opts.user ? { user: opts.user, pass: opts.password } : undefined,
    });
  }
  async send(msg: EmailMessage) {
    const info = await this.transport.sendMail({ from: this.from, ...msg });
    return { id: info.messageId };
  }
}

/** Dev fallback when SMTP_HOST is empty: prints the email (including magic links) to the console. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage) {
    this.sent.push(msg);
    console.info(`\n📧 [email] to=${msg.to}\n   subject: ${msg.subject}\n   ${msg.text.replace(/\n/g, "\n   ")}\n`);
    return { id: `console-${Date.now()}` };
  }
}

let provider: EmailProvider | undefined;
export function emailProvider(): EmailProvider {
  if (!provider) {
    const e = env();
    provider = e.SMTP_HOST
      ? new SmtpEmailProvider(e.EMAIL_FROM, {
          host: e.SMTP_HOST,
          port: e.SMTP_PORT,
          user: e.SMTP_USER,
          password: e.SMTP_PASSWORD,
        })
      : new ConsoleEmailProvider();
  }
  return provider;
}
