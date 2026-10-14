import { registerDecorator } from 'class-validator';
import type { ValidationArguments, ValidationOptions } from 'class-validator';
import { normalizeVietnamPhone } from '../helpers/auth-normalization.js';

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
