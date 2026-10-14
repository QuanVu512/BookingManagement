import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

export function auditPhones(users) {
  const invalidIds = [];
  const usersByPhone = new Map();
  let changedCount = 0;
  for (const user of users) {
    const input = typeof user.phone === 'string' ? user.phone.trim() : '';
    const parsed = /^(?:0|\+84)[0-9]+$/.test(input)
      ? parsePhoneNumberFromString(input, {
          defaultCountry: 'VN',
          extract: false,
        })
      : undefined;
    if (!parsed || parsed.country !== 'VN' || !parsed.isValid()) {
      invalidIds.push(user.id);
      continue;
    }
    if (parsed.number !== user.phone) changedCount += 1;
    const ids = usersByPhone.get(parsed.number) ?? [];
    ids.push(user.id);
    usersByPhone.set(parsed.number, ids);
  }
  const collisions = [...usersByPhone.values()].filter((ids) => ids.length > 1);
  return { total: users.length, changedCount, invalidIds, collisions };
}
