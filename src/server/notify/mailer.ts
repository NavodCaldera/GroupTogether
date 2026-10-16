import "server-only";
import nodemailer from "nodemailer";

/**
 * Email adapter. MAILER="gmail" sends through Gmail SMTP (GMAIL_USER + GMAIL_APP_PASSWORD);
 * anything else uses the mock, which logs and keeps what it "sent" for tests.
 */
export interface Mailer {
  readonly name: string;
  send(mail: Mail): Promise<{ ok: true } | { ok: false; error: string }>;
}

export type Mail = { to: string; subject: string; text: string };

export class MockMailer implements Mailer {
  readonly name = "mock";
  readonly sent: Mail[] = [];

  async send(mail: Mail) {
    this.sent.push(mail);
    if (process.env.NODE_ENV === "development") {
      console.info(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`);
    }
    return { ok: true as const };
  }
}

export class GmailMailer implements Mailer {
  readonly name = "gmail";
  private readonly transport;

  constructor(
    private readonly user: string,
    pass: string,
  ) {
    this.transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  }

  async send(mail: Mail) {
    try {
      await this.transport.sendMail({ from: `GroupTogether <${this.user}>`, ...mail });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }
}

let instance: Mailer | undefined;

/** Tests only: swap the mailer. */
export function setMailerForTests(m: Mailer | undefined) {
  instance = m;
}

export function mailer(): Mailer {
  if (!instance) {
    const { MAILER, GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
    if (MAILER === "gmail") {
      if (!GMAIL_USER || !GMAIL_APP_PASSWORD)
        throw new Error("MAILER=gmail needs GMAIL_USER and GMAIL_APP_PASSWORD");
      instance = new GmailMailer(GMAIL_USER, GMAIL_APP_PASSWORD);
    } else {
      instance = new MockMailer();
    }
  }
  return instance;
}
