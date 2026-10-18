import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Explicit transaction context shared by module ports that must participate in
 * one caller-owned PostgreSQL transaction. Only persistence adapters should
 * depend on the Prisma-specific shape behind this alias.
 */
export type TransactionContext = Prisma.TransactionClient;
