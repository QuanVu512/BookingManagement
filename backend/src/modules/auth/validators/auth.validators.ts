import { registerDecorator } from 'class-validator';
import type { ValidationArguments, ValidationOptions } from 'class-validator';
import { normalizeVietnamPhone } from '../helpers/auth-normalization.js';
import { isValidAuthPassword } from '../helpers/auth-password.js';
import {
  AUTH_VALIDATION_MESSAGES,
  LOGIN_PASSWORD_MAX_BYTES,
} from '../constants/auth-validation.constants.js';

export function IsAuthPassword(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isAuthPassword',
      target: target.constructor,
      propertyName: String(propertyKey),
      options,
      validator: { validate: isValidAuthPassword },
    });
}

/**
 * Login only: non-empty raw password within the UTF-8 byte budget.
 * Never trims, normalizes or applies the registration policy.
 */
export function IsLoginPassword(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isLoginPassword',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: {
        message: AUTH_VALIDATION_MESSAGES.loginPassword,
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          value.length > 0 &&
          Buffer.byteLength(value, 'utf8') <= LOGIN_PASSWORD_MAX_BYTES,
      },
    });
}

export function IsVietnamPhone(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isVietnamPhone',
      target: target.constructor,
      propertyName: String(propertyKey),
      options,
      validator: {
        validate: (value: unknown) => normalizeVietnamPhone(value) !== null,
      },
    });
}

export function MatchesPassword(
  options?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'matchesPassword',
      target: target.constructor,
      propertyName: String(propertyKey),
      options,
      validator: {
        validate(
          value: unknown,
          argumentsContext: ValidationArguments,
        ): boolean {
          const source = argumentsContext.object;
          return (
            typeof value === 'string' &&
            'password' in source &&
            value === source.password
          );
        },
      },
    });
}
