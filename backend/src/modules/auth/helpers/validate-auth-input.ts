import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import type { ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';

export function validateAuthInput<Dto extends object>(
  dtoClass: ClassConstructor<Dto>,
  input: Dto,
): Dto {
  const dto = plainToInstance(dtoClass, input);
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    throw new BadRequestException(
      errors.flatMap((error) => Object.values(error.constraints ?? {})),
    );
  }
  return dto;
}
