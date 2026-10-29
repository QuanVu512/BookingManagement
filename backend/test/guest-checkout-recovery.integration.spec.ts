import { afterAll, beforeAll, describe, expect, jest, it } from '@jest/globals';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

/**
 * Chứng minh bất biến DB của Plan v2.4 Bước 1 sau remediation:
 * - AC-R3: consume proof kiểm hạn/binding ngay trong UPDATE nguyên tử, kể cả
 *   khi request chờ advisory lock qua mốc hết hạn (hai connection thật).
 * - AC-R4: tombstone zero-length cho outbox, giữ dedup/audit và chặn purge
 *   nửa vời bằng CHECK constraint.
 *
 * Chỉ chạy trên DB test tường minh; không fallback DB ứng dụng.
 */
const databaseUrl = process.env.GUEST_RECOVERY_DATABASE_TEST_URL;
const TARGET_DATABASE = 'guest_recovery_test';

function assertIsolatedDatabase(value: string): void {
  const target = new URL(value);
  const allowedProtocols = ['postgresql:', 'postgres:'];
  if (!allowedProtocols.includes(target.protocol)) {
    throw new Error('Chỉ chấp nhận PostgreSQL loopback cho test này.');
  }
  if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
    throw new Error('Chỉ chấp nhận host loopback cho test này.');
  }
  if (target.pathname !== `/${TARGET_DATABASE}`) {
    throw new Error(`Chỉ chấp nhận database ${TARGET_DATABASE}.`);
  }
}

const LOCK_SQL = 'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))';

const CONSUME_PROOF_SQL = `
  UPDATE guest_otp_proofs
  SET status = 'CONSUMED',
      consumed_at = clock_timestamp(),
      fencing_generation = fencing_generation + 1
  WHERE id = $1
    AND status = 'ACTIVE'
    AND expires_at > clock_timestamp()
    AND email = $2
    AND purpose = 'GUEST_HOLD_CREATE'
  RETURNING fencing_generation
`;

const storageDescribe = databaseUrl ? describe : describe.skip;

storageDescribe('guest checkout recovery DB invariants (Bước 1)', () => {
  jest.setTimeout(30_000);

  let holder: pg.Client;
  let worker: pg.Client;
  const createdProofIds: string[] = [];
  const createdOutboxIds: string[] = [];

  async function insertProof(
    expiresInSql: string,
    email = 'guest@example.test',
    purpose = 'GUEST_HOLD_CREATE',
  ): Promise<string> {
    const id = randomUUID();
    await holder.query(
      `INSERT INTO guest_otp_proofs (id, email, purpose, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, clock_timestamp() + $5::interval)`,
      [id, email, purpose, randomBytes(32).toString('hex'), expiresInSql],
    );
    createdProofIds.push(id);
    return id;
  }

  async function insertOutbox(
    overrides: {
      status?: string;
      expiresInSql?: string;
      deduplicationKey?: string;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await holder.query(
      `INSERT INTO outbox_messages (
         id, aggregate_type, aggregate_id, event_type, payload_ciphertext,
         iv, auth_tag, key_version, deduplication_key, status, expires_at
       ) VALUES (
         $1, 'BOOKING', $2, 'guest.recovery.invite',
         decode('0102030405', 'hex'), $3, $4, 'v1', $5, $6,
         clock_timestamp() + $7::interval
       )`,
      [
        id,
        randomUUID(),
        randomBytes(12),
        randomBytes(16),
        overrides.deduplicationKey ?? `dedup-${randomUUID()}`,
        overrides.status ?? 'SENT',
        overrides.expiresInSql ?? '-2 days',
      ],
    );
    createdOutboxIds.push(id);
    return id;
  }

  beforeAll(async () => {
    if (!databaseUrl) return;
    assertIsolatedDatabase(databaseUrl);
    holder = new pg.Client({ connectionString: databaseUrl });
    worker = new pg.Client({ connectionString: databaseUrl });
    await holder.connect();
    await worker.connect();
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    if (createdProofIds.length > 0) {
      await holder.query(
        'DELETE FROM guest_otp_proofs WHERE id = ANY($1::uuid[])',
        [createdProofIds],
      );
    }
    if (createdOutboxIds.length > 0) {
      await holder.query(
        'DELETE FROM outbox_messages WHERE id = ANY($1::uuid[])',
        [createdOutboxIds],
      );
    }
    await holder.end();
    await worker.end();
  });

  it('does not consume a proof that expired while waiting for the lock', async () => {
    const intentId = randomUUID();
    const email = 'late@example.test';
    const proofId = await insertProof('1 second', email);

    await holder.query('BEGIN');
    await holder.query(LOCK_SQL, ['guest-checkout-intent', intentId]);
    await worker.query('BEGIN');
    const waitingLock = worker.query(LOCK_SQL, [
      'guest-checkout-intent',
      intentId,
    ]);
    await delay(1500);
    await holder.query('COMMIT');
    await waitingLock;

    const consumed = await worker.query(CONSUME_PROOF_SQL, [proofId, email]);
    await worker.query('COMMIT');

    expect(consumed.rowCount).toBe(0);
    const stored = await holder.query<{
      status: string;
      fencing_generation: string;
      expired: boolean;
    }>(
      `SELECT status, fencing_generation,
              expires_at <= clock_timestamp() AS expired
       FROM guest_otp_proofs WHERE id = $1`,
      [proofId],
    );
    expect(stored.rows[0]).toEqual({
      status: 'ACTIVE',
      fencing_generation: '0',
      expired: true,
    });
  });

  it('consumes exactly once with the bound email and purpose', async () => {
    const proofId = await insertProof('5 minutes', 'right@example.test');

    const wrongEmail = await holder.query(CONSUME_PROOF_SQL, [
      proofId,
      'wrong@example.test',
    ]);
    const first = await holder.query<{ fencing_generation: string }>(
      CONSUME_PROOF_SQL,
      [proofId, 'right@example.test'],
    );
    const second = await holder.query(CONSUME_PROOF_SQL, [
      proofId,
      'right@example.test',
    ]);

    expect(wrongEmail.rowCount).toBe(0);
    expect(first.rowCount).toBe(1);
    expect(first.rows[0]?.fencing_generation).toBe('1');
    expect(second.rowCount).toBe(0);
  });

  it('rejects a proof with the wrong purpose even when email matches', async () => {
    const proofId = await insertProof(
      '5 minutes',
      'purpose@example.test',
      'MANAGE_BOOKING',
    );
    const result = await holder.query(CONSUME_PROOF_SQL, [
      proofId,
      'purpose@example.test',
    ]);
    expect(result.rowCount).toBe(0);
  });

  it('requires otp_proof_id on every checkout intent', async () => {
    const column = await holder.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'guest_checkout_intents'
         AND column_name = 'otp_proof_id'`,
    );
    expect(column.rows[0]?.is_nullable).toBe('NO');
  });

  it('purges outbox payload to a zero-length tombstone and keeps dedup/audit', async () => {
    const deduplicationKey = `dedup-${randomUUID()}`;
    const outboxId = await insertOutbox({ deduplicationKey });

    const purged = await holder.query(
      `UPDATE outbox_messages
       SET payload_ciphertext = ''::bytea,
           iv = ''::bytea,
           auth_tag = ''::bytea,
           purged_at = clock_timestamp()
       WHERE id = $1 AND purged_at IS NULL`,
      [outboxId],
    );
    expect(purged.rowCount).toBe(1);

    const stored = await holder.query<{
      status: string;
      payload_length: number;
      iv_length: number;
      auth_tag_length: number;
      purged: boolean;
      deduplication_key: string;
    }>(
      `SELECT status,
              octet_length(payload_ciphertext) AS payload_length,
              octet_length(iv) AS iv_length,
              octet_length(auth_tag) AS auth_tag_length,
              purged_at IS NOT NULL AS purged,
              deduplication_key
       FROM outbox_messages WHERE id = $1`,
      [outboxId],
    );
    expect(stored.rows[0]).toEqual({
      status: 'SENT',
      payload_length: 0,
      iv_length: 0,
      auth_tag_length: 0,
      purged: true,
      deduplication_key: deduplicationKey,
    });

    await expect(
      holder.query(
        `INSERT INTO outbox_messages (
           aggregate_type, aggregate_id, event_type, payload_ciphertext,
           iv, auth_tag, key_version, deduplication_key, expires_at
         ) VALUES (
           'BOOKING', $1, 'guest.recovery.invite', decode('01', 'hex'),
           $2, $3, 'v1', $4, clock_timestamp()
         )`,
        [randomUUID(), randomBytes(12), randomBytes(16), deduplicationKey],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('rejects a half purge that keeps non-zero ciphertext', async () => {
    const outboxId = await insertOutbox();
    await expect(
      holder.query(
        'UPDATE outbox_messages SET purged_at = clock_timestamp() WHERE id = $1',
        [outboxId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
