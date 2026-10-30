export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
};

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<{ id?: string }>;
}

/** WhatsApp messages are pre-approved templates (Meta requirement for business-initiated messages). */
export type WhatsAppMessage = {
  /** E.164 without '+', e.g. 919876543210 */
  to: string;
  template: string;
  language?: string;
  params: string[];
  /** Plain-text rendering, used by the console provider and logs */
  preview: string;
};

export interface WhatsAppProvider {
  readonly name: string;
  send(msg: WhatsAppMessage): Promise<{ id?: string }>;
}
