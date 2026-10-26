import { InMemoryPrivacyRequestStore } from '../infrastructure/in-memory-privacy-request-store.js';
import { SubmitPrivacyRequestUseCase } from './submit-privacy-request.use-case.js';
import {
  GetOwnPrivacyRequestUseCase,
  ListOwnPrivacyRequestsUseCase,
} from './get-own-request.use-case.js';

describe('Privacy Rights Workflow (Phase 5 - C5)', () => {
  let store: InMemoryPrivacyRequestStore;
  let submitUseCase: SubmitPrivacyRequestUseCase;
  let listOwnUseCase: ListOwnPrivacyRequestsUseCase;
  let getOwnUseCase: GetOwnPrivacyRequestUseCase;

  beforeEach(() => {
    store = new InMemoryPrivacyRequestStore();
    submitUseCase = new SubmitPrivacyRequestUseCase(store);
    listOwnUseCase = new ListOwnPrivacyRequestsUseCase(store);
    getOwnUseCase = new GetOwnPrivacyRequestUseCase(store);
  });

  it('T11-1: tiếp nhận yêu cầu trích xuất dữ liệu của thành viên đã xác thực', async () => {
    const userId = 'user-123';
    const req = await submitUseCase.execute({
      type: 'ACCESS',
      subjectKind: 'MEMBER',
      userId,
      description: 'Tôi muốn yêu cầu trích xuất toàn bộ dữ liệu lịch sử đặt sân của tôi.',
      idempotencyKey: 'idem-1',
    });

    expect(req.id).toBeTruthy();
    expect(req.type).toBe('ACCESS');
    expect(req.subjectKind).toBe('MEMBER');
    expect(req.status).toBe('UNDER_REVIEW');
    expect(req.verifiedAt).not.toBeNull();
    expect(req.responseDueAt).toBeTruthy();

    const list = await listOwnUseCase.executeForUser(userId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(req.id);
  });

  it('T11-2: xử lý idempotency: gửi cùng idempotencyKey trả về hồ sơ cũ', async () => {
    const input = {
      type: 'ERASE' as const,
      subjectKind: 'MEMBER' as const,
      userId: 'user-456',
      description: 'Tôi muốn yêu cầu đóng tài khoản và hạn chế xử lý dữ liệu cá nhân.',
      idempotencyKey: 'idem-duplicate',
    };

    const first = await submitUseCase.execute(input);
    const second = await submitUseCase.execute(input);

    expect(first.id).toBe(second.id);
    expect(first.receivedAt.getTime()).toBe(second.receivedAt.getTime());
  });

  it('T11-3: chặn truy cập chéo dữ liệu (IDOR protection)', async () => {
    const req = await submitUseCase.execute({
      type: 'ACCESS',
      subjectKind: 'MEMBER',
      userId: 'user-A',
      description: 'Yêu cầu trích xuất thông tin cá nhân của người dùng A.',
      idempotencyKey: 'idem-user-a',
    });

    // Attempting to read user-A's request with user-B's identity should throw NotFoundException
    await expect(
      getOwnUseCase.execute(req.id, { userId: 'user-B' }),
    ).rejects.toThrow('Không tìm thấy yêu cầu quyền riêng tư');
  });

  it('T13-1: chuyển đổi trạng thái CAS và ghi nhận audit event', async () => {
    const req = await submitUseCase.execute({
      type: 'CORRECT',
      subjectKind: 'MEMBER',
      userId: 'user-C',
      description: 'Yêu cầu đính chính địa chỉ email liên hệ trong hồ sơ.',
      idempotencyKey: 'idem-user-c',
    });

    const updated = await store.updateStatus(req.id, 0, 'APPROVED', {
      actorType: 'STAFF',
      eventCode: 'REQUEST_APPROVED',
      publicNote: 'Yêu cầu đã được kiểm duyệt hợp lệ.',
    });

    expect(updated.status).toBe('APPROVED');
    expect(updated.revision).toBe(1);

    const events = await store.listEvents(req.id);
    expect(events).toHaveLength(2);
    expect(events[1].eventCode).toBe('REQUEST_APPROVED');
  });
});
