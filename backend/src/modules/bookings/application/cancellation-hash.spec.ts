import { createHash } from 'node:crypto';

describe('DATA-04 Cancellation Snapshot Revision Hardening', () => {
  it('tạo SHA256 canonical 64 ký tự hex vừa vặn cột VARCHAR(100) của PostgreSQL', () => {
    const bookingId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
    const bookingVersion = 3;
    const receipts = [
      {
        id: '11111111-2222-3333-4444-555555555555',
        amount: 500000,
        verificationStatus: 'VERIFIED',
        allocationStatus: 'ALLOCATED',
      },
      {
        id: '66666666-7777-8888-9999-000000000000',
        amount: 500000,
        verificationStatus: 'VERIFIED',
        allocationStatus: 'ALLOCATED',
      },
    ];
    const holds = [
      {
        paymentTransactionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        amount: 100000,
        status: 'ACTIVE',
      },
    ];
    const policyVersion = 'cancel-v1.0';

    const revisionParts = [
      `booking:${bookingId}:v${bookingVersion}`,
      ...receipts.map(
        (r) =>
          `${r.id}:${r.amount.toString()}:${r.verificationStatus}:${r.allocationStatus}`,
      ),
      ...holds.map((h) => `${h.paymentTransactionId}:${h.amount.toString()}:${h.status}`),
      policyVersion,
    ].sort();

    const rawString = revisionParts.join('|');
    // Verify that the old string format easily exceeded 100 characters:
    expect(rawString.length).toBeGreaterThan(100);

    const hashedRevision = createHash('sha256').update(rawString).digest('hex');
    expect(hashedRevision).toHaveLength(64);
    expect(hashedRevision.length).toBeLessThanOrEqual(100);

    // Verify deterministic parity:
    const recomputed = createHash('sha256').update(rawString).digest('hex');
    expect(recomputed).toBe(hashedRevision);
  });
});
