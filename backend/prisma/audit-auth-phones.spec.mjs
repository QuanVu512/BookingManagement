import { expect, test } from '@jest/globals';
import { auditPhones } from './audit-auth-phones.mjs';
const USER_IDS = ['first-user', 'second-user'];

test('audit detects collisions and invalid numbers without revealing phone values', () => {
  const report = auditPhones([
    { id: USER_IDS[0], phone: '0912345678' },
    { id: USER_IDS[1], phone: '+84912345678' },
    { id: 'invalid-user', phone: '0123456789' },
  ]);
  expect(report).toEqual({
    total: 3,
    changedCount: 1,
    invalidIds: ['invalid-user'],
    collisions: [USER_IDS],
  });
});

test('normalizes mobile and fixed lines and is idempotent without mutating rows', () => {
  const users = [
    { id: 'a', phone: ' 0912345678 ' },
    { id: 'b', phone: '02431234567' },
  ];
  const original = structuredClone(users);
  expect(auditPhones(users)).toEqual({
    total: 2,
    changedCount: 2,
    invalidIds: [],
    collisions: [],
  });
  expect(users).toEqual(original);
  expect(
    auditPhones([
      { id: 'a', phone: '+84912345678' },
      { id: 'b', phone: '+842431234567' },
    ]),
  ).toEqual({ total: 2, changedCount: 0, invalidIds: [], collisions: [] });
});

test('does not expose phone values and rejects invalid input shapes', () => {
  const users = [
    '0123456789',
    '+8491234567',
    'call 0912345678',
    null,
    undefined,
    912345678,
  ].map((phone, id) => ({ id: String(id), phone }));
  const report = auditPhones(users);
  expect(report.invalidIds).toEqual(users.map(({ id }) => id));
  expect(report.changedCount).toBe(0);
  expect(JSON.stringify(report)).not.toContain('0912345678');
  expect(auditPhones([])).toEqual({
    total: 0,
    changedCount: 0,
    invalidIds: [],
    collisions: [],
  });
});
