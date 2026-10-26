import { InMemorySupportCaseStore } from '../infrastructure/in-memory-support-case-store.js';
import {
  SubmitComplaintUseCase,
  GetOwnComplaintUseCase,
} from './submit-complaint.use-case.js';

describe('Support & Complaints Module (Phase 5 - C7)', () => {
  let store: InMemorySupportCaseStore;
  let submitUseCase: SubmitComplaintUseCase;
  let getOwnUseCase: GetOwnComplaintUseCase;

  beforeEach(() => {
    store = new InMemorySupportCaseStore();
    submitUseCase = new SubmitComplaintUseCase(store);
    getOwnUseCase = new GetOwnComplaintUseCase(store);
  });

  it('T24-1: tiếp nhận phản ánh hỗ trợ và phát sinh mã tra cứu SPT-xxxxxx', async () => {
    const complaint = await submitUseCase.execute({
      category: 'REFUND',
      subjectKind: 'CONTACT_ONLY',
      contactEmail: 'customer@example.com',
      contactPhone: '0901234567',
      bookingId: 'BK-9999',
      description: 'Tôi cần hỗ trợ đối soát biên nhận hoàn tiền cho đơn đặt sân ngày hôm qua.',
      idempotencyKey: 'spt-idem-1',
    });

    expect(complaint.id).toBeTruthy();
    expect(complaint.caseCode).toMatch(/^SPT-\d{6}$/);
    expect(complaint.status).toBe('RECEIVED');
    expect(complaint.resolutionTargetAt).toBeTruthy();

    const lookup = await getOwnUseCase.execute(complaint.caseCode);
    expect(lookup.supportCase.id).toBe(complaint.id);
    expect(lookup.events).toHaveLength(1);
    expect(lookup.events[0].eventCode).toBe('CASE_RECEIVED');
  });

  it('T24-2: từ chối email không hợp lệ hoặc mô tả quá ngắn', async () => {
    await expect(
      submitUseCase.execute({
        category: 'SERVICE',
        subjectKind: 'CONTACT_ONLY',
        contactEmail: 'invalid-email',
        description: 'Mô tả hợp lệ nhưng email sai.',
        idempotencyKey: 'spt-err-1',
      }),
    ).rejects.toThrow('Vui lòng cung cấp email liên hệ hợp lệ.');

    await expect(
      submitUseCase.execute({
        category: 'SERVICE',
        subjectKind: 'CONTACT_ONLY',
        contactEmail: 'valid@example.com',
        description: 'Quá ngắn',
        idempotencyKey: 'spt-err-2',
      }),
    ).rejects.toThrow('Nội dung phản ánh tối thiểu 10 ký tự.');
  });
});
