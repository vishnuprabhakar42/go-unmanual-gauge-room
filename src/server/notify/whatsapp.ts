import { env } from "@/env";
import type { WhatsAppMessage, WhatsAppProvider } from "./types";

export class ConsoleWhatsAppProvider implements WhatsAppProvider {
  readonly name = "console";
  readonly sent: WhatsAppMessage[] = [];
  async send(msg: WhatsAppMessage) {
    this.sent.push(msg);
    console.info(`\n💬 [whatsapp] to=${msg.to} template=${msg.template}\n   ${msg.preview}\n`);
    return { id: `console-${Date.now()}` };
  }
}

/**
 * Meta WhatsApp Cloud API (template messages). Stub-level: sends the documented request shape;
 * templates must be approved in Meta Business Manager with matching names/params.
 */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta";
  constructor(private readonly cfg: { token: string; phoneNumberId: string; apiVersion: string }) {}
  async send(msg: WhatsAppMessage) {
    if (!this.cfg.token || !this.cfg.phoneNumberId) throw new Error("Meta WhatsApp provider is not configured");
    const res = await fetch(`https://graph.facebook.com/${this.cfg.apiVersion}/${this.cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: msg.to,
        type: "template",
        template: {
          name: msg.template,
          language: { code: msg.language ?? "en" },
          components: [{ type: "body", parameters: msg.params.map((text) => ({ type: "text", text })) }],
        },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { messages?: { id: string }[] };
    return { id: body.messages?.[0]?.id };
  }
}

let provider: WhatsAppProvider | undefined;
export function whatsAppProvider(): WhatsAppProvider {
  if (!provider) {
    const e = env();
    provider =
      e.WHATSAPP_PROVIDER === "meta"
        ? new MetaWhatsAppProvider({
            token: e.META_WHATSAPP_TOKEN,
            phoneNumberId: e.META_WHATSAPP_PHONE_NUMBER_ID,
            apiVersion: e.META_WHATSAPP_API_VERSION,
          })
        : new ConsoleWhatsAppProvider();
  }
  return provider;
}
