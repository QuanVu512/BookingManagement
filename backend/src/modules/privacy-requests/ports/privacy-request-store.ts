import type {
  PrivacyRequest,
  PrivacyRequestEvent,
  PrivacyRequestStatus,
} from '../domain/privacy-request.js';

export const PRIVACY_REQUEST_STORE = Symbol('PRIVACY_REQUEST_STORE');

export interface PrivacyRequestStore {
  createRequest(request: PrivacyRequest): Promise<PrivacyRequest>;
  findById(id: string): Promise<PrivacyRequest | null>;
  findByUserId(userId: string): Promise<PrivacyRequest[]>;
  findByBookingId(bookingId: string): Promise<PrivacyRequest[]>;
  findByIdempotencyKey(key: string): Promise<PrivacyRequest | null>;
  updateStatus(
    id: string,
    expectedRevision: number,
    newStatus: PrivacyRequestStatus,
    event: Omit<PrivacyRequestEvent, 'id' | 'sequence' | 'occurredAt'>,
  ): Promise<PrivacyRequest>;
  listEvents(requestId: string): Promise<PrivacyRequestEvent[]>;
}
