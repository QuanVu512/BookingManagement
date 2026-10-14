// Persistence entities are generated from schema.prisma, not API response DTOs.
// Run npm run prisma:generate before consuming these types.
export type {
  User as UserEntity,
  UserRole as UserRoleEntity,
  RefreshToken as RefreshTokenEntity,
} from '../../generated/prisma/client.js';
