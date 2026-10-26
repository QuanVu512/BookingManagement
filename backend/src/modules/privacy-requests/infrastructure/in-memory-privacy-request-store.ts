import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import type {
  PrivacyRequest,
  PrivacyRequestEvent,
  PrivacyRequestStatus,
} from '../domain/privacy-request.js';
import { isValidTransition } from '../domain/privacy-request.js';
import type { PrivacyRequestStore } from '../ports/privacy-request-store.js';

@Injectable()
export class InMemoryPrivacyRequestStore implements PrivacyRequestStore {
  private requests = new Map<string, PrivacyRequest>();
  private events = new Map<string, PrivacyRequestEvent[]>();

  async createRequest(request: PrivacyRequest): Promise<PrivacyRequest> {
    const existing = await this.findByIdempotencyKey(request.idempotencyKey);
    if (existing) {
      return existing;
    }
    this.requests.set(request.id, { ...request });
    const initialEvent: PrivacyRequestEvent = {
      id: crypto.randomUUID(),
      requestId: request.id,
      sequence: 1,
      actorType: request.subjectKind === 'MEMBER' ? 'CUSTOMER' : 'GUEST',
      actorUserId: request.userId ?? null,
      eventCode: 'REQUEST_CREATED',
      publicNote: 'Yêu cầu quyền riêng tư đã được tiếp nhận.',
      occurredAt: new Date(),
    };
    this.events.set(request.id, [initialEvent]);
    return { ...request };
  }

  async findById(id: string): Promise<PrivacyRequest | null> {
    const req = this.requests.get(id);
    return req ? { ...req } : null;
  }

  async findByUserId(userId: string): Promise<PrivacyRequest[]> {
    return Array.from(this.requests.values()).filter((r) => r.userId === userId);
  }

  async findByBookingId(bookingId: string): Promise<PrivacyRequest[]> {
    return Array.from(this.requests.values()).filter((r) => r.bookingId === bookingId);
  }

  async findByIdempotencyKey(key: string): Promise<PrivacyRequest | null> {
    const req = Array.from(this.requests.values()).find((r) => r.idempotencyKey === key);
    return req ? { ...req } : null;
  }

  async updateStatus(
    id: string,
    expectedRevision: number,
    newStatus: PrivacyRequestStatus,
    eventData: Omit<PrivacyRequestEvent, 'id' | 'sequence' | 'occurredAt'>,
  ): Promise<PrivacyRequest> {
    const req = this.requests.get(id);
    if (!req) {
      throw new NotFoundException({
        code: 'PRIVACY_REQUEST_NOT_FOUND',
        message: 'Không tìm thấy yêu cầu quyền riêng tư.',
      });
    }

    if (req.revision !== expectedRevision) {
      throw new ConflictException({
        code: 'REVISION_CONFLICT',
        message: 'Trạng thái yêu cầu đã thay đổi, vui lòng thử lại.',
      });
    }

    if (!isValidTransition(req.status, newStatus)) {
      throw new ConflictException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Không thể chuyển trạng thái từ ${req.status} sang ${newStatus}.`,
      });
    }

    const currentEvents = this.events.get(id) || [];
    const nextSequence = currentEvents.length + 1;

    const newEvent: PrivacyRequestEvent = {
      id: crypto.randomUUID(),
      requestId: id,
      sequence: nextSequence,
      actorType: eventData.actorType,
      actorUserId: eventData.actorUserId ?? null,
      eventCode: eventData.eventCode,
      publicNote: eventData.publicNote ?? null,
      occurredAt: new Date(),
    };

    currentEvents.push(newEvent);
    this.events.set(id, currentEvents);

    const updated: PrivacyRequest = {
      ...req,
      status: newStatus,
      revision: req.revision + 1,
      publicNotes: eventData.publicNote ?? req.publicNotes,
      completedAt:
        newStatus === 'COMPLETED' || newStatus === 'PARTIALLY_COMPLETED' || newStatus === 'REJECTED'
          ? new Date()
          : req.completedAt,
    };

    this.requests.set(id, updated);
    return { ...updated };
  }

  async listEvents(requestId: string): Promise<PrivacyRequestEvent[]> {
    return [...(this.events.get(requestId) || [])];
  }
}
