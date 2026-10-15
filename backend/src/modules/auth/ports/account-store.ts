import type { Role, UserStatus } from '../../../enums/index.js';

export interface AuthAccount {
  id: string;
  username: string;
  email: string;
  phone: string;
  passwordHash: string;
  status: UserStatus;
  tokenVersion: number;
  emailVerifiedAt: Date | null;
  profile: { fullName: string } | null;
  roles: { role: Role }[];
}

export interface RegistrationInput {
  username: string;
  email: string;
  phone: string;
  fullName: string;
}

export abstract class AccountStore {
  abstract findById(id: string): Promise<AuthAccount | null>;
  abstract findByIdentifier(identifier: string): Promise<AuthAccount | null>;
  abstract findConflict(
    input: RegistrationInput,
  ): Promise<Pick<AuthAccount, 'username' | 'email' | 'phone'> | null>;
  abstract create(
    input: RegistrationInput,
    passwordHash: string,
  ): Promise<AuthAccount>;
}

export class AccountConflictError extends Error {}
