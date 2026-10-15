import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { Role, UserStatus } from '../../../enums/index.js';
import { phoneLookupValues } from '../helpers/auth-normalization.js';
import {
  AccountStore,
  AccountConflictError,
  type AuthAccount,
  type RegistrationInput,
} from '../ports/account-store.js';

@Injectable()
export class PrismaAccountStore extends AccountStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  findById(id: string): Promise<AuthAccount | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { profile: true, roles: true },
    });
  }

  findByIdentifier(identifier: string): Promise<AuthAccount | null> {
    return this.prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: identifier.toLowerCase() },
          { phone: { in: phoneLookupValues(identifier) } },
        ],
      },
      include: { profile: true, roles: true },
    });
  }

  async findConflict(input: RegistrationInput) {
    const usernameMatch = await this.prisma.user.findFirst({
      where: { username: input.username },
    });
    if (usernameMatch?.username === input.username) return usernameMatch;
    return this.prisma.user.findFirst({
      where: {
        OR: [
          { username: input.username },
          { email: input.email },
          { phone: { in: phoneLookupValues(input.phone) } },
        ],
      },
    });
  }

  async create(
    input: RegistrationInput,
    passwordHash: string,
  ): Promise<AuthAccount> {
    try {
      return await this.prisma.$transaction((transaction) =>
        transaction.user.create({
          data: {
            username: input.username,
            email: input.email,
            phone: input.phone,
            passwordHash,
            status: UserStatus.ACTIVE,
            profile: { create: { fullName: input.fullName } },
            roles: { create: { role: Role.CUSTOMER } },
          },
          include: { profile: true, roles: true },
        }),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new AccountConflictError();
      throw error;
    }
  }
}
