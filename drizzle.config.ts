import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { getPgPoolConfig } from "./server/db-config";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const poolConfig = getPgPoolConfig(process.env.DATABASE_URL);

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: poolConfig.connectionString!,
    ssl: poolConfig.ssl ?? undefined,
  },
});
