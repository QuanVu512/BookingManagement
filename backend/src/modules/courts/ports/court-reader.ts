import type { ActiveCourtReadModel } from '../application/models/court-read-models.js';

/**
 * Persistence port used by the public catalog use cases. Implementations own
 * the Prisma-only details; callers only see active courts as read models.
 */
export abstract class CourtReader {
  abstract findActiveCourts(): Promise<ActiveCourtReadModel[]>;

  abstract findActiveCourtById(id: string): Promise<ActiveCourtReadModel | null>;
}
