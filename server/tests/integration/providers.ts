/**
 * In-process mock of Resend and Africa's Talking for integration tests.
 * Nothing leaves the machine; every "sent" message is recorded so tests can
 * read the link/code the real user would have received.
 */
import http from "http";
import { AddressInfo } from "net";

export interface SentEmail { to: string[]; from: string; subject: string; html: string; text: string; auth: string }
export interface SentSms { to: string; message: string; from?: string; apiKey: string; username: string }

export class MockProviders {
  server!: http.Server;
  port = 0;
  emails: SentEmail[] = [];
  sms: SentSms[] = [];
  emailMode: "ok" | "fail" | "forbidden" = "ok";
  smsMode: "ok" | "queued" | "balance" | "invalid" | "badkey" | "blocked" = "ok";

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const json = (status: number, body: unknown) => {
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(body));
        };
        if (req.method === "POST" && req.url === "/emails") {
          if (this.emailMode === "fail") return json(500, { name: "application_error", message: "boom for someone@example.com" });
          if (this.emailMode === "forbidden") return json(403, { name: "validation_error", message: "domain not verified" });
          const b = JSON.parse(raw);
          this.emails.push({ ...b, auth: String(req.headers.authorization ?? "") });
          return json(200, { id: `em_${this.emails.length}` });
        }
        if (req.method === "POST" && req.url === "/version1/messaging") {
          if (this.smsMode === "badkey") return json(401, { message: "bad key" });
          const p = new URLSearchParams(raw);
          const sms: SentSms = {
            to: p.get("to") ?? "",
            message: p.get("message") ?? "",
            from: p.get("from") ?? undefined,
            apiKey: String(req.headers.apikey ?? ""),
            username: p.get("username") ?? "",
          };
          const rec = (statusCode: number, status: string) =>
            json(201, { SMSMessageData: { Message: "Sent to 1/1", Recipients: [{ statusCode, status, messageId: statusCode < 400 ? `ATXid_${this.sms.length + 1}` : undefined, number: sms.to }] } });
          if (this.smsMode === "balance") return rec(405, "InsufficientBalance");
          if (this.smsMode === "blocked") return rec(406, "UserInBlacklist");
          if (this.smsMode === "invalid") return json(201, { SMSMessageData: { Message: "InvalidPhoneNumber", Recipients: [] } });
          this.sms.push(sms);
          return rec(this.smsMode === "queued" ? 102 : 101, this.smsMode === "queued" ? "Queued" : "Success");
        }
        json(404, { error: "no mock route" });
      });
    });
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", () => r()));
    this.port = (this.server.address() as AddressInfo).port;
  }
  async stop(): Promise<void> {
    await new Promise<void>((r) => this.server.close(() => r()));
  }
  reset(): void {
    this.emails = [];
    this.sms = [];
    this.emailMode = "ok";
    this.smsMode = "ok";
  }
  /** The first http(s) URL in the most recent email's plain-text body. */
  lastEmailLink(): string {
    const e = this.emails[this.emails.length - 1];
    const m = e?.text.match(/https?:\/\/\S+/);
    if (!m) throw new Error("no link in last email");
    return m[0];
  }
  /** The 6-digit code from the most recent SMS. */
  lastSmsCode(): string {
    const s = this.sms[this.sms.length - 1];
    const m = s?.message.match(/\b(\d{6})\b/);
    if (!m) throw new Error("no code in last SMS");
    return m[1];
  }
}
