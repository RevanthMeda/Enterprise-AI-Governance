import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { ssoLoginExchanges } from "@shared/schema";
import { db } from "../db";
import {
  SsoLoginExchangeManager,
  type SsoLoginExchangeClaim,
  type SsoLoginExchangeInsert,
  type SsoLoginExchangeStore,
} from "./ssoLoginExchangeCore";

export {
  SSO_LOGIN_EXCHANGE_CODE_PATTERN,
  SSO_LOGIN_EXCHANGE_TTL_MS,
  hashSsoLoginExchangeCode,
  SsoLoginExchangeManager,
} from "./ssoLoginExchangeCore";
export type {
  SsoLoginExchangeClaim,
  SsoLoginExchangeInsert,
  SsoLoginExchangeStore,
} from "./ssoLoginExchangeCore";

class PostgresSsoLoginExchangeStore implements SsoLoginExchangeStore {
  async insert(input: SsoLoginExchangeInsert): Promise<void> {
    await db.insert(ssoLoginExchanges).values({
      codeHash: input.codeHash,
      userId: input.userId,
      organizationId: input.organizationId,
      nextPath: input.nextPath,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      consumedAt: null,
    });
  }

  async consume(codeHash: string, now: Date): Promise<SsoLoginExchangeClaim | null> {
    const [claimed] = await db
      .update(ssoLoginExchanges)
      .set({ consumedAt: now })
      .where(
        and(
          eq(ssoLoginExchanges.codeHash, codeHash),
          isNull(ssoLoginExchanges.consumedAt),
          gt(ssoLoginExchanges.expiresAt, now),
        ),
      )
      .returning({
        userId: ssoLoginExchanges.userId,
        organizationId: ssoLoginExchanges.organizationId,
        nextPath: ssoLoginExchanges.nextPath,
      });
    return claimed ?? null;
  }

  async cleanup(expiredBefore: Date): Promise<void> {
    await db.delete(ssoLoginExchanges).where(lt(ssoLoginExchanges.expiresAt, expiredBefore));
  }
}

export const ssoLoginExchangeService = new SsoLoginExchangeManager(
  new PostgresSsoLoginExchangeStore(),
);
