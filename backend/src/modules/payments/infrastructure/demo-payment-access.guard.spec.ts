import { describe, expect, it, jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { DemoPaymentAccessGuard } from './demo-payment-access.guard.js';

function setup(token?: string) {
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ header: () => token }) }),
  } as ExecutionContext;
  const jwt = { canActivate: jest.fn(async () => true) };
  const csrf = { canActivate: jest.fn(async () => true) };
  const guest = { canActivate: jest.fn(async () => true) };
  const guard = new DemoPaymentAccessGuard(
    jwt as never,
    csrf as never,
    guest as never,
  );
  return { context, jwt, csrf, guest, guard };
}

describe('Simulator authorization boundary', () => {
  it('requires both JWT and CSRF for members', async () => {
    const { context, guard, jwt, csrf, guest } = setup();
    expect(await guard.canActivate(context)).toBe(true);
    expect(jwt.canActivate).toHaveBeenCalledWith(context);
    expect(csrf.canActivate).toHaveBeenCalledWith(context);
    expect(guest.canActivate).not.toHaveBeenCalled();
  });
  it('does not fallback after JWT denial', async () => {
    const { context, guard, jwt, csrf, guest } = setup();
    jwt.canActivate.mockResolvedValueOnce(false);
    expect(await guard.canActivate(context)).toBe(false);
    expect(csrf.canActivate).not.toHaveBeenCalled();
    expect(guest.canActivate).not.toHaveBeenCalled();
  });
  it('rejects invalid CSRF', async () => {
    const { context, guard, csrf } = setup();
    csrf.canActivate.mockResolvedValueOnce(false);
    expect(await guard.canActivate(context)).toBe(false);
  });
  it('validates a scoped guest token without cookie authentication', async () => {
    const { context, guard, jwt, csrf, guest } = setup('guest-token');
    expect(await guard.canActivate(context)).toBe(true);
    expect(guest.canActivate).toHaveBeenCalledWith(context);
    expect(jwt.canActivate).not.toHaveBeenCalled();
    expect(csrf.canActivate).not.toHaveBeenCalled();
  });
  it('does not fallback to member authentication for an invalid guest token', async () => {
    const { context, guard, jwt, guest } = setup('invalid-token');
    guest.canActivate.mockRejectedValueOnce(new UnauthorizedException());
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
    expect(jwt.canActivate).not.toHaveBeenCalled();
  });
});
