import assert from "node:assert/strict";
import test from "node:test";
import { createTransport } from "nodemailer";
import { escapeEmailHtml, sanitizeEmailText } from "../server/email-content";
import { buildInviteMail } from "../server/services/inviteDeliveryService";
import { buildPasswordResetMail } from "../server/services/passwordResetService";
import { Socket } from "node:net";

async function composeMail(to: string | { name: string; address: string }, mail: { subject: string; text: string; html: string }) {
  // Generate the real MIME message and envelope in memory; never contact SMTP.
  let connections = 0;
  const connect = test.mock.method(Socket.prototype, "connect", () => {
    connections++;
    throw new Error("Email regression must not open a socket");
  });
  const transport = createTransport({ streamTransport: true, buffer: true });
  try {
    const result = await transport.sendMail({ from: "sender@example.test", to, ...mail });
    assert.equal(connections, 0);
    assert.deepEqual(result.envelope.from, "sender@example.test");
    assert.ok(Buffer.isBuffer(result.message));
    assert.match(result.message.toString(), /MIME-Version: 1\.0/);
    return result;
  } finally {
    transport.close();
    connect.mock.restore();
  }
}

const nestedCommentRecipient = "Recipient (outer(inner) <decoy@example.test>) <recipient@example.test>";

test("invitation MIME envelope ignores addresses inside nested comments", async () => {
  const mail = buildInviteMail({
    email: nestedCommentRecipient, organizationName: "Synthetic Org", role: "reviewer",
    inviteUrl: "https://app.example.test/invite/accept#token=synthetic", mode: "created",
    expiresAt: new Date("2030-01-01T12:00:00Z"),
  });
  const result = await composeMail(nestedCommentRecipient, mail);
  assert.deepEqual(result.envelope.to, ["recipient@example.test"]);
});

test("password-reset MIME envelope ignores addresses inside nested comments", async () => {
  const mail = buildPasswordResetMail({
    email: nestedCommentRecipient, fullName: "Synthetic Person",
    resetUrl: "https://app.example.test/reset#token=synthetic",
    expiresAt: new Date("2030-01-01T12:00:00Z"),
  });
  const result = await composeMail(nestedCommentRecipient, mail);
  assert.deepEqual(result.envelope.to, ["recipient@example.test"]);
});

test("MIME envelope preserves plain, quoted-name and structured recipients", async () => {
  for (const to of ["recipient@example.test", '"Recipient, Example" <recipient@example.test>', { name: "Recipient, Example", address: "recipient@example.test" }]) {
    const result = await composeMail(to, { subject: "Synthetic mail", text: "Synthetic content", html: "<p>Synthetic content</p>" });
    assert.deepEqual(result.envelope.to, ["recipient@example.test"]);
  }
});

test("email helpers encode markup and remove header control characters", () => {
  assert.equal(
    escapeEmailHtml(`<img src=x onerror="alert('x')">&`),
    "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;",
  );
  assert.equal(sanitizeEmailText("Northstar\r\nBcc: attacker@example.test"), "Northstar Bcc: attacker@example.test");
});

test("password-reset email treats names and links as text", () => {
  const mail = buildPasswordResetMail({
    email: "person@example.test",
    fullName: `<img src=x onerror="alert(1)">`,
    resetUrl: `https://app.example.test/reset?token=x\" onclick=\"alert(1)`,
    expiresAt: new Date("2030-01-01T12:00:00.000Z"),
  });

  assert.doesNotMatch(mail.html, /<img|onclick="alert/);
  assert.match(mail.html, /&lt;img/);
  assert.match(mail.html, /&quot; onclick=&quot;/);
});

test("invite email sanitizes subject lines and HTML content", () => {
  const mail = buildInviteMail({
    email: "person@example.test",
    organizationName: "Northstar\r\nBcc: attacker@example.test<script>alert(1)</script>",
    role: `<b>owner</b>`,
    inviteUrl: `https://app.example.test/invite?token=x\" onclick=\"alert(1)`,
    expiresAt: new Date("2030-01-01T12:00:00.000Z"),
    invitedByName: `<img src=x onerror=alert(1)>`,
    mode: "created",
  });

  assert.doesNotMatch(mail.subject, /[\r\n]/);
  assert.doesNotMatch(mail.html, /<script|<img|<b>|onclick="alert/);
  assert.match(mail.html, /&lt;script&gt;/);
  assert.match(mail.html, /&lt;b&gt;owner&lt;\/b&gt;/);
});
