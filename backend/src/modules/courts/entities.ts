// Persistence entities are generated from schema.prisma, not API response DTOs.
// Run npm run prisma:generate before consuming these types.
export type {
  Branch as BranchEntity,
  Court as CourtEntity,
  BranchBusinessHour as BranchBusinessHourEntity,
  PriceRule as PriceRuleEntity,
} from '../../generated/prisma/client.js';
