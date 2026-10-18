import { Prisma } from '../../../generated/prisma/client.js';

export const courtInclude = {
  priceRules: true,
  branch: { include: { businessHours: true } },
} satisfies Prisma.CourtInclude;

export type ScheduledCourt = Prisma.CourtGetPayload<{
  include: typeof courtInclude;
}>;
