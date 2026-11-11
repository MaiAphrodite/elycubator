import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:51214/template1";

const pool = new pg.Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 0,
});

const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
