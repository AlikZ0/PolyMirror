import { PrismaClient } from '@prisma/client';

export type Db = PrismaClient;

export function createPrisma(databaseUrl: string, logQueries = false): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: logQueries ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

/** Prisma unique-constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
