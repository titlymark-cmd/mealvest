/**
 * Shared MEALVEST email layout. Table-based with inline CSS (the only thing
 * Gmail/Outlook/Apple Mail render consistently), fluid up to 520px so it reads
 * well on a phone, using the app's palette: espresso #1D1511 header,
 * cream #FCF4EA canvas, tomato #E5482E call-to-action.
 *
 * Every dynamic value is HTML-escaped here, in one place, so no caller can
 * accidentally inject markup. Links are never logged.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailContent {
  /** Hidden inbox preview line. */
  preheader: string;
  heading: string;
  /** Plain paragraphs; each is escaped and rendered as its own <p>. */
  paragraphs: string[];
  buttonLabel: string;
  buttonUrl: string;
  /** Small grey print under the button. */
  footnote: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

export function renderEmail(c: EmailContent): RenderedEmail {
  const url = escapeHtml(c.buttonUrl);
  const paras = c.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:24px;color:#2C1610;">${escapeHtml(p)}</p>`)
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(c.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#FCF4EA;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#FCF4EA;">${escapeHtml(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FCF4EA;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Poppins,'Helvetica Neue',Arial,sans-serif;">
      <tr><td style="background:#1D1511;padding:20px 28px;">
        <span style="font-size:20px;font-weight:700;letter-spacing:1px;color:#FCF4EA;">MEAL<span style="color:#FF8A3D;">VEST</span></span>
      </td></tr>
      <tr><td style="padding:28px;">
        <h1 style="margin:0 0 16px;font-size:22px;line-height:28px;color:#1D1511;">${escapeHtml(c.heading)}</h1>
        ${paras}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
          <tr><td style="background:#E5482E;border-radius:10px;">
            <a href="${url}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(c.buttonLabel)}</a>
          </td></tr>
        </table>
        <p style="margin:0 0 6px;font-size:13px;line-height:20px;color:#6B625C;">Button not working? Copy this link into your browser:</p>
        <p style="margin:0 0 18px;font-size:12px;line-height:18px;word-break:break-all;color:#6B625C;">${url}</p>
        <p style="margin:0;font-size:13px;line-height:20px;color:#6B625C;">${escapeHtml(c.footnote)}</p>
      </td></tr>
      <tr><td style="background:#FFE1C7;padding:14px 28px;font-size:12px;line-height:18px;color:#6B625C;">
        MEALVEST — meals made simple for students. This is an automated message; please don't reply.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    c.heading,
    "",
    ...c.paragraphs,
    "",
    `${c.buttonLabel}: ${c.buttonUrl}`,
    "",
    c.footnote,
    "",
    "— MEALVEST",
  ].join("\n");

  return { html, text };
}
