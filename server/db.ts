import "./load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { getPgPoolConfig } from "./db-config";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new pg.Pool(getPgPoolConfig(process.env.DATABASE_URL));

export const db = drizzle(pool, { schema });
