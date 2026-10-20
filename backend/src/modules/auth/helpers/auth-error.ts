import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

export interface AuthErrorBody {
  statusCode: number;
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

/** Builds the additive auth error envelope without touching payment shapes. */
export function authError(
  statusCode: number,
  code: string,
  message: string,
  fieldErrors?: Record<string, string>,
): HttpException {
  const body: AuthErrorBody = { statusCode, code, message };
  if (fieldErrors) body.fieldErrors = fieldErrors;
  switch (statusCode) {
    case 400:
      return new BadRequestException(body);
    case 401:
      return new UnauthorizedException(body);
    case 403:
      return new ForbiddenException(body);
    case 409:
      return new ConflictException(body);
    case 410:
      return new GoneException(body);
    case 503:
      return new ServiceUnavailableException(body);
    default:
      return new HttpException(body, statusCode);
  }
}
