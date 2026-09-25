import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * The one Prisma client, running over the node-postgres driver adapter.
 *
 * ### Why an adapter (measured 2026-09-24)
 *
 * The built-in query engine, pointed at Supabase's transaction pooler with
 * `pgbouncer=true`, cost about FIVE network round trips per query — 504 ms for a
 * trivial query where the raw network round trip was ~100 ms. The same query
 * through node-postgres over the same pooler cost one (103 ms). Every page makes
 * several queries, so this multiplied straight into load time.
 *
 * node-postgres uses unnamed prepared statements, which a transaction-mode
 * pooler handles, so `pgbouncer=true` is no longer needed — Prisma's own
 * guidance is not to set it for modern poolers. It is stripped here rather than
 * removed from the environment, so no deployed env var has to change in step
 * with this code.
 *
 * Migrations and the `db/*.ts` scripts are unaffected: the CLI still reads
 * `DIRECT_URL` from `schema.prisma`, and the scripts use `pg` directly.
 */
function runtimeConnectionString(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is not set.');
  const url = new URL(raw);
  // Prisma-engine-only parameters. node-postgres does not understand them, and
  // `pgbouncer=true` in particular is what the adapter replaces.
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('connection_limit');
  return url.toString();
}

function createClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: runtimeConnectionString(),
    // Small on purpose. Each serverless instance holds its own pool, and
    // Supavisor multiplexes them onto the database; a large pool per instance
    // only reserves pooler slots nobody uses.
    max: 5,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
