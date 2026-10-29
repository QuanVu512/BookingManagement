import { Injectable, Logger } from '@nestjs/common';
import {
  GuestCheckoutStore,
  type GuestCheckoutReconcileReport,
} from '../ports/guest-checkout-store.js';

const RECONCILE_BATCH_LIMIT = 200;

/**
 * Task 2.1 — Reconciliation job cho guest checkout, thay Lua/lease Redis.
 *
 * PostgreSQL là authority; job chỉ housekeeping trạng thái hết hạn và phát
 * hiện bất biến bị phá (orphan) để ops xử lý. Tuyệt đối không tự sửa proof
 * CONSUMED thiếu intent: consume proof + insert intent cùng một transaction,
 * DB rollback đã tự trả proof về ACTIVE; orphan là sự cố dữ liệu cần điều tra.
 */
@Injectable()
export class GuestCheckoutReconcileService {
  private readonly logger = new Logger(GuestCheckoutReconcileService.name);

  constructor(private readonly store: GuestCheckoutStore) {}

  async run(): Promise<GuestCheckoutReconcileReport> {
    const expiredProofs = await this.store.expireOverdueProofs(
      RECONCILE_BATCH_LIMIT,
    );
    const expiredIntents = await this.store.expireOverdueIntents(
      RECONCILE_BATCH_LIMIT,
    );
    const consumedProofsWithoutIntent =
      await this.store.findConsumedProofsWithoutIntent(RECONCILE_BATCH_LIMIT);
    const intentsWithoutConsumedProof =
      await this.store.findIntentsWithoutConsumedProof(RECONCILE_BATCH_LIMIT);
    const intentsWithoutBooking = await this.store.findIntentsWithoutBooking(
      RECONCILE_BATCH_LIMIT,
    );

    if (consumedProofsWithoutIntent.length > 0) {
      this.logger.warn(
        `GUEST_CHECKOUT_ORPHAN_PROOF: ${consumedProofsWithoutIntent.length} proof CONSUMED không có intent.`,
      );
    }
    if (intentsWithoutConsumedProof.length > 0) {
      this.logger.warn(
        `GUEST_CHECKOUT_ORPHAN_INTENT: ${intentsWithoutConsumedProof.length} intent thiếu proof CONSUMED.`,
      );
    }
    if (intentsWithoutBooking.length > 0) {
      this.logger.warn(
        `GUEST_CHECKOUT_ORPHAN_BOOKING: ${intentsWithoutBooking.length} intent thiếu booking.`,
      );
    }

    return {
      expiredProofs,
      expiredIntents,
      consumedProofsWithoutIntent,
      intentsWithoutConsumedProof,
      intentsWithoutBooking,
    };
  }
}
