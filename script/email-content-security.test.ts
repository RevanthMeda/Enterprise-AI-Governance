import assert from "node:assert/strict";
import test from "node:test";
import { escapeEmailHtml, sanitizeEmailText } from "../server/email-content";
import { buildInviteMail } from "../server/services/inviteDeliveryService";
import { buildPasswordResetMail } from "../server/services/passwordResetService";

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
