import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import { AUTH_ERROR_CODES } from '../../modules/auth/constants/auth-validation.constants.js';

interface ErrorBody {
  code?: unknown;
  message?: unknown;
  fieldErrors?: unknown;
}

/**
 * RF-02 — additive error envelope for /api/auth only.
 * Non-auth routes (including payment endpoints) keep their existing shape.
 */
@Catch()
export class AuthErrorEnvelopeFilter extends BaseExceptionFilter {
  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    if (!request.path?.startsWith('/api/auth')) {
      super.catch(exception, host);
      return;
    }
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw =
      exception instanceof HttpException ? exception.getResponse() : null;
    const body: ErrorBody =
      typeof raw === 'object' && raw !== null ? (raw as ErrorBody) : {};
    const rawMessage =
      typeof raw === 'string'
        ? raw
        : typeof body.message === 'string'
          ? body.message
          : Array.isArray(body.message)
            ? body.message.filter((item) => typeof item === 'string').join('; ')
            : '';
    const isLogin = request.path.endsWith('/login');
    const isRegister = request.path.includes('/register');
    const code =
      typeof body.code === 'string' ? body.code : inferCode(status, request.path, rawMessage);
    const message = normalizeMessage(status, isLogin, isRegister, rawMessage);
    const payload: Record<string, unknown> = {
      statusCode: status,
      code,
      message,
    };
    if (body.fieldErrors && typeof body.fieldErrors === 'object') {
      payload.fieldErrors = body.fieldErrors;
    }
    if (!this.applicationRef) {
      super.catch(exception, host);
      return;
    }
    this.applicationRef.reply(context.getResponse(), payload, status);
  }
}

function inferCode(status: number, path: string, message: string): string {
  if (status === HttpStatus.BAD_REQUEST) {
    if (path.includes('/login')) return AUTH_ERROR_CODES.invalidLoginInput;
    if (path.includes('/register') || path.includes('/reset-password')) {
      return AUTH_ERROR_CODES.invalidRegistrationInput;
    }
    return AUTH_ERROR_CODES.invalidLoginInput;
  }
  if (status === HttpStatus.UNAUTHORIZED) {
    if (path.includes('/login')) {
      return message.includes('xác minh email')
        ? AUTH_ERROR_CODES.emailVerificationRequired
        : AUTH_ERROR_CODES.invalidCredentials;
    }
    return AUTH_ERROR_CODES.sessionExpired;
  }
  if (status === HttpStatus.FORBIDDEN) return AUTH_ERROR_CODES.csrfRejected;
  if (status === HttpStatus.CONFLICT) return AUTH_ERROR_CODES.accountConflict;
  if (status === HttpStatus.GONE) return 'ONBOARDING_EXPIRED';
  if (status === HttpStatus.TOO_MANY_REQUESTS) {
    return AUTH_ERROR_CODES.authRateLimited;
  }
  if (status === HttpStatus.SERVICE_UNAVAILABLE) {
    return AUTH_ERROR_CODES.authUnavailable;
  }
  return status >= 500 ? AUTH_ERROR_CODES.authUnavailable : 'AUTH_ERROR';
}

function normalizeMessage(
  status: number,
  isLogin: boolean,
  isRegister: boolean,
  rawMessage: string,
): string {
  if (status === HttpStatus.BAD_REQUEST) {
    if (isLogin) return rawMessage || 'Dữ liệu đăng nhập chưa hợp lệ.';
    if (isRegister) return rawMessage || 'Dữ liệu đăng ký chưa hợp lệ.';
  }
  if (status >= 500) return 'Dịch vụ xác thực tạm thời không khả dụng.';
  return rawMessage || 'Yêu cầu xác thực không hợp lệ.';
}
