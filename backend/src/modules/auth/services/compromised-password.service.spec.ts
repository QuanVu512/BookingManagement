import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CompromisedPasswordService } from './compromised-password.service.js';

describe('Compromised password checks', () => {
  const service = new CompromisedPasswordService();
  const password = 'correct horse battery staple';
  const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
  afterEach(() => jest.restoreAllMocks());
  it('sends only the five-character prefix and accepts a clean passphrase', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(`${'A'.repeat(35)}:1\r\n${hash.slice(5)}:0`),
      );
    await expect(service.assertAllowed(password)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({ 'Add-Padding': 'true' }),
      }),
    );
    expect(JSON.stringify(fetch.mock.calls)).not.toContain(password);
    expect(JSON.stringify(fetch.mock.calls)).not.toContain(hash);
  });
  it('rejects a compromised/common password', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(`${hash.slice(5)}:123`));
    await expect(service.assertAllowed(password)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it.each([new Response('', { status: 503 }), new Response('invalid-range')])(
    'fails closed on unavailable or malformed service responses',
    async (response) => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
      await expect(service.assertAllowed(password)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    },
  );
  it('fails closed on timeout', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    await expect(service.assertAllowed(password)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it('rejects maximum overflow before fetching or hashing', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch');
    await expect(service.assertAllowed('a'.repeat(129))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
