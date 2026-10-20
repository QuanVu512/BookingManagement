'use client';
import { useState } from 'react';
import {
  newIdempotencyKey,
  staffAllocateReceipt,
  staffApproveRefund,
  staffCollectBalance,
  staffListRefunds,
  staffLookupBooking,
  staffReconcileRefund,
  staffReconcileRequest,
  staffRejectRefund,
  staffRevealDestination,
} from '../api/payment-service';

function useAction<T>(action: () => Promise<T>) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<T | null>(null);
  async function run() {
    setRunning(true);
    setError(null);
    try {
      setResult(await action());
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : 'Thao tác thất bại.',
      );
    } finally {
      setRunning(false);
    }
  }
  return { running, error, result, run };
}

/**
 * FE-PAY-08 — Panel vận hành thanh toán (MIG-16).
 * Đủ thao tác E12/E14/E15/E16/E17/E18/E19/E21/E22 với cùng auth/audit như
 * API; không dùng SQL tay/cURL token rời. Mọi số tiền hiển thị từ server.
 */
export function StaffOpsPanel() {
  const [bookingId, setBookingId] = useState('');
  const [method, setMethod] = useState<'CASH' | 'MANUAL_BANK_TRANSFER'>('CASH');
  const [reference, setReference] = useState('');
  const [receiptId, setReceiptId] = useState('');
  const [paymentRequestId, setPaymentRequestId] = useState('');
  const [refundId, setRefundId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [lookupQuery, setLookupQuery] = useState('');

  const balance = useAction(() =>
    staffCollectBalance({
      bookingId,
      method,
      transactionReference: reference || undefined,
      idempotencyKey: newIdempotencyKey(),
    }),
  );
  const allocate = useAction(() =>
    staffAllocateReceipt({
      receiptId,
      paymentRequestId,
      idempotencyKey: newIdempotencyKey(),
    }),
  );
  const reconcileRequest = useAction(() => staffReconcileRequest(paymentRequestId));
  const refunds = useAction(() => staffListRefunds({}));
  const approve = useAction(() =>
    staffApproveRefund({ refundId, idempotencyKey: newIdempotencyKey() }),
  );
  const reject = useAction(() =>
    staffRejectRefund({
      refundId,
      rejectionReason: rejectReason,
      idempotencyKey: newIdempotencyKey(),
    }),
  );
  const reveal = useAction(() => staffRevealDestination(refundId));
  const reconcileRefund = useAction(() =>
    staffReconcileRefund({ refundId }),
  );
  const lookup = useAction(() => staffLookupBooking(lookupQuery));

  return (
    <section aria-label="Vận hành thanh toán">
      <h2>Vận hành thanh toán</h2>

      <section aria-label="Tra cứu booking">
        <h3>Tra cứu (E12)</h3>
        <p>
          <label>
            Mã đơn hoặc số điện thoại
            <input
              value={lookupQuery}
              onChange={(event) => setLookupQuery(event.target.value)}
            />
          </label>{' '}
          <button type="button" onClick={() => void lookup.run()}>
            Tra cứu
          </button>
        </p>
        {lookup.error && <p role="alert">{lookup.error}</p>}
        {lookup.result && (
          <pre>{JSON.stringify(lookup.result, null, 2)}</pre>
        )}
      </section>

      <section aria-label="Thu số dư tại quầy">
        <h3>Thu số dư (E14)</h3>
        <p>
          <label>
            Booking ID
            <input
              value={bookingId}
              onChange={(event) => setBookingId(event.target.value)}
            />
          </label>{' '}
          <label>
            Hình thức
            <select
              value={method}
              onChange={(event) =>
                setMethod(event.target.value as 'CASH' | 'MANUAL_BANK_TRANSFER')
              }
            >
              <option value="CASH">Tiền mặt</option>
              <option value="MANUAL_BANK_TRANSFER">Chuyển khoản tay</option>
            </select>
          </label>{' '}
          <label>
            Reference (chuyển khoản)
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </label>{' '}
          <button
            type="button"
            disabled={balance.running}
            onClick={() => void balance.run()}
          >
            Thu theo số dư server
          </button>
        </p>
        {balance.error && <p role="alert">{balance.error}</p>}
        {balance.result && (
          <p role="status">
            Đã ghi nhận thu tại quầy. Chi tiết theo response server.
          </p>
        )}
      </section>

      <section aria-label="Phân bổ receipt">
        <h3>Phân bổ receipt (E16) / Đối soát request (E15)</h3>
        <p>
          <label>
            Receipt ID
            <input
              value={receiptId}
              onChange={(event) => setReceiptId(event.target.value)}
            />
          </label>{' '}
          <label>
            Payment request ID
            <input
              value={paymentRequestId}
              onChange={(event) => setPaymentRequestId(event.target.value)}
            />
          </label>{' '}
          <button type="button" onClick={() => void allocate.run()}>
            Phân bổ
          </button>{' '}
          <button type="button" onClick={() => void reconcileRequest.run()}>
            Đối soát với provider
          </button>
        </p>
        {allocate.error && <p role="alert">{allocate.error}</p>}
        {reconcileRequest.error && <p role="alert">{reconcileRequest.error}</p>}
      </section>

      <section aria-label="Hoàn tiền">
        <h3>Hoàn tiền (E17–E22)</h3>
        <p>
          <button type="button" onClick={() => void refunds.run()}>
            Tải danh sách hoàn
          </button>
        </p>
        {refunds.error && <p role="alert">{refunds.error}</p>}
        <p>
          <label>
            Refund ID
            <input
              value={refundId}
              onChange={(event) => setRefundId(event.target.value)}
            />
          </label>{' '}
          <label>
            Lý do từ chối
            <input
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
            />
          </label>
        </p>
        <p>
          <button type="button" onClick={() => void approve.run()}>
            Duyệt (four-eyes)
          </button>{' '}
          <button type="button" onClick={() => void reject.run()}>
            Từ chối
          </button>{' '}
          <button type="button" onClick={() => void reveal.run()}>
            Xem destination (audit)
          </button>{' '}
          <button type="button" onClick={() => void reconcileRefund.run()}>
            Đối soát hoàn
          </button>
        </p>
        {approve.error && <p role="alert">{approve.error}</p>}
        {reject.error && <p role="alert">{reject.error}</p>}
        {reveal.error && <p role="alert">{reveal.error}</p>}
        {reconcileRefund.error && <p role="alert">{reconcileRefund.error}</p>}
        {reveal.result && (
          <p role="status">
            Destination đã ghi audit truy cập. Số hiển thị theo chính sách
            che dấu của server.
          </p>
        )}
      </section>
    </section>
  );
}
