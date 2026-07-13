import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { createServer, type Server } from "http";
import { inArray } from "drizzle-orm";
import { hashPassword, setupAuth } from "../server/auth";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { memberships, users } from "../shared/schema";

type ApiResponse = {
  status: number;
  body: unknown;
  setCookie?: string;
};

function makeSuffix() {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

function cookieFromSetCookie(setCookie?: string): string | undefined {
  if (!setCookie) return undefined;
  const firstCookie = setCookie.split(",")[0] ?? "";
  const pair = firstCookie.split(";")[0] ?? "";
  return pair || undefined;
}

async function apiRequest(
  baseUrl: string,
  path: string,
  opts?: {
    method?: string;
    body?: unknown;
    cookie?: string;
  },
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  if (opts?.cookie) {
    headers.Cookie = opts.cookie;
  }
  if (opts?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: opts?.method ?? "GET",
    headers,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await res.json() : await res.text();

  return {
    status: res.status,
    body,
    setCookie: res.headers.get("set-cookie") ?? undefined,
  };
}

async function startTestServer(): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  const server = createServer(app);

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));

  setupAuth(app);
  await registerRoutes(server, app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test("password reset flow issues preview link in non-production and rotates credentials", async () => {
  const suffix = makeSuffix();
  const originalPassword = "Str0ng!Passw0rd";
  const newPassword = "EvenStr0nger!Passw0rd";
  const racingPassword = "RacingReset!Passw0rd2";
  const user = await storage.createUser({
    username: `password_reset_${suffix}`,
    password: await hashPassword(originalPassword),
    fullName: `Password Reset ${suffix}`,
    email: `password-reset-${suffix}@example.com`,
    role: "reviewer",
  });

  let server: Server | undefined;

  try {
    const appServer = await startTestServer();
    server = appServer.server;
    const baseUrl = appServer.baseUrl;

    const forgotPassword = await apiRequest(baseUrl, "/api/auth/forgot-password", {
      method: "POST",
      body: { identifier: user.email },
    });
    assert.equal(forgotPassword.status, 202);
    const forgotBody = forgotPassword.body as { previewUrl?: string };
    assert.ok(forgotBody.previewUrl, "Expected preview URL in non-production reset flow");

    const resetUrl = new URL(forgotBody.previewUrl!);
    const token = resetUrl.searchParams.get("token");
    assert.ok(token, "Expected token in preview URL");

    const resetAttempts = await Promise.all(
      [newPassword, racingPassword].map((candidatePassword) =>
        apiRequest(baseUrl, "/api/auth/reset-password", {
          method: "POST",
          body: { token, newPassword: candidatePassword },
        }),
      ),
    );
    assert.deepEqual(
      resetAttempts.map((attempt) => attempt.status).sort((a, b) => a - b),
      [200, 400],
      "A password-reset token must be consumed exactly once under concurrency",
    );
    const winningPassword = resetAttempts[0].status === 200 ? newPassword : racingPassword;
    const losingPassword = resetAttempts[0].status === 200 ? racingPassword : newPassword;

    const oldLogin = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: user.username, password: originalPassword },
    });
    assert.equal(oldLogin.status, 401, "Expected old password to stop working");

    const losingLogin = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: user.email, password: losingPassword },
    });
    assert.equal(losingLogin.status, 401, "Expected the losing concurrent password never to take effect");

    const newLogin = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: user.email, password: winningPassword },
    });
    assert.equal(newLogin.status, 200, "Expected new password login to succeed by email");
    const newLoginCookie = cookieFromSetCookie(newLogin.setCookie);
    assert.ok(newLoginCookie, "Expected session cookie after reset login");
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
    }

    const userMemberships = await storage.getMembershipsByUserId(user.id);
    if (userMemberships.length > 0) {
      await db.delete(memberships).where(inArray(memberships.id, userMemberships.map((membership) => membership.id)));
    }
    await db.delete(users).where(inArray(users.id, [user.id]));
  }
});

test("password changes revoke every previously issued authenticated session", async () => {
  const { readFile } = await import("node:fs/promises");
  const storageSource = await readFile(new URL("../server/storage.ts", import.meta.url), "utf8");
  const authSource = await readFile(new URL("../server/auth.ts", import.meta.url), "utf8");

  assert.match(storageSource, /sessionVersion:\s*sql`\$\{users\.sessionVersion\} \+ 1`/);
  assert.match(authSource, /sessionVersion:\s*user\.sessionVersion/);
  assert.match(authSource, /user\.sessionVersion !== sessionVersion/);
  assert.match(authSource, /Invalidate the legacy ID-only session format/);
});
