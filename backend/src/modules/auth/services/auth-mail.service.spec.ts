import { AUTH_MAIL_TIMEOUT_MS } from '../constants/auth-validation.constants.js';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import { AuthMailService } from './auth-mail.service.js';

describe('Auth SMTP adapter', () => {
  it('delivers through a loopback SMTP fixture with real Nodemailer and no external recipient', async () => {
    const sockets = new Set<Socket>();
    let received = '';
    const server = createServer((socket) => {
      sockets.add(socket);
      let buffered = '';
      let isMessage = false;
      socket.write('220 localhost auth-test\r\n');
      socket.on('data', (chunk) => {
        buffered += chunk.toString('utf8');
        const lines = buffered.split('\r\n');
        buffered = lines.pop() ?? '';
        for (const line of lines) {
          if (isMessage && line !== '.') {
            received += `${line}\n`;
            continue;
          }
          if (isMessage) {
            isMessage = false;
            socket.write('250 accepted\r\n');
          } else if (line.startsWith('EHLO'))
            socket.write('250-localhost\r\n250 SIZE 1048576\r\n');
          else if (line === 'DATA') {
            isMessage = true;
            socket.write('354 send message\r\n');
          } else if (line === 'QUIT') socket.end('221 goodbye\r\n');
          else socket.write('250 OK\r\n');
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing SMTP fixture address');
      const service = new AuthMailService(
        new ConfigService({
          ...settings,
          NODE_ENV: 'test',
          SMTP_HOST: '127.0.0.1',
          SMTP_PORT: String(address.port),
          SMTP_REQUIRE_TLS: 'false',
          SMTP_USER: '',
          SMTP_PASSWORD: '',
        }),
      );
      await service.sendToken(
        'reset-password',
        'test-only@example.com',
        'a'.repeat(64),
      );
      expect(received).toContain('To: test-only@example.com');
      expect(received).toContain('/auth/reset-password#token=');
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  const settings = {
    NODE_ENV: 'production',
    WEB_ORIGIN: 'https://booking.example.com',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_FROM: 'no-reply@example.com',
    SMTP_USER: 'explicit-user',
    SMTP_PASSWORD: 'test-only-password',
  };
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('requires explicit SMTP configuration and TLS in production', () => {
    expect(() => new AuthMailService(new ConfigService({}))).toThrow();
    expect(
      () =>
        new AuthMailService(
          new ConfigService({ ...settings, SMTP_REQUIRE_TLS: 'false' }),
        ),
    ).toThrow('TLS');
    expect(
      () =>
        new AuthMailService(
          new ConfigService({ ...settings, SMTP_PASSWORD: '' }),
        ),
    ).toThrow('together');
  });
  it('sends fragment-based links without logging secrets or permitting external content loading', async () => {
    const sendMail = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ accepted: ['customer@example.com'] });
    const factory = jest.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail,
      close: jest.fn(),
    } as unknown as Transporter);
    const log = jest.spyOn(console, 'log');
    const error = jest.spyOn(console, 'error');
    await new AuthMailService(new ConfigService(settings)).sendToken(
      'verify-email',
      'customer@example.com',
      'a'.repeat(64),
    );
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        requireTLS: true,
        logger: false,
        debug: false,
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'customer@example.com',
        text: expect.stringContaining(
          `/auth/verify-email#token=${'a'.repeat(64)}`,
        ),
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    );
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
  it('returns a generic error instead of provider details', async () => {
    jest.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: async () => {
        throw new Error('raw token and SMTP credentials');
      },
      close: jest.fn(),
    } as unknown as Transporter);
    await expect(
      new AuthMailService(new ConfigService(settings)).sendToken(
        'reset-password',
        'customer@example.com',
        'a'.repeat(64),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('bounds delivery duration and closes a stalled transport', async () => {
    jest.useFakeTimers();
    const close = jest.fn();
    jest.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: () => new Promise(() => undefined),
      close,
    } as unknown as Transporter);
    const pending = new AuthMailService(new ConfigService(settings)).sendToken(
      'reset-password',
      'customer@example.com',
      'a'.repeat(64),
    );
    const assertion = expect(pending).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await jest.advanceTimersByTimeAsync(AUTH_MAIL_TIMEOUT_MS);
    await assertion;
    expect(close).toHaveBeenCalled();
  });
});
