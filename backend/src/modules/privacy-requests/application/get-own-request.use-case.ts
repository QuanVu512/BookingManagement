import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PRIVACY_REQUEST_STORE,
  type PrivacyRequestStore,
} from '../ports/privacy-request-store.js';
import type { PrivacyRequest, PrivacyRequestEvent } from '../domain/privacy-request.js';

@Injectable()
export class ListOwnPrivacyRequestsUseCase {
  constructor(
    @Inject(PRIVACY_REQUEST_STORE)
    private readonly requestStore: PrivacyRequestStore,
  ) {}

  async executeForUser(userId: string): Promise<PrivacyRequest[]> {
    return this.requestStore.findByUserId(userId);
  }

  async executeForBooking(bookingId: string): Promise<PrivacyRequest[]> {
    return this.requestStore.findByBookingId(bookingId);
  }
}

@Injectable()
export class GetOwnPrivacyRequestUseCase {
  constructor(
    @Inject(PRIVACY_REQUEST_STORE)
    private readonly requestStore: PrivacyRequestStore,
  ) {}

  async execute(
    requestId: string,
    caller: { userId?: string; bookingId?: string },
  ): Promise<{ request: PrivacyRequest; events: PrivacyRequestEvent[] }> {
    const request = await this.requestStore.findById(requestId);
    if (!request) {
      throw new NotFoundException({
        code: 'PRIVACY_REQUEST_NOT_FOUND',
        message: 'Không tìm thấy yêu cầu quyền riêng tư.',
      });
    }

    const isAuthorized =
      (caller.userId && request.userId === caller.userId) ||
      (caller.bookingId && request.bookingId === caller.bookingId);

    if (!isAuthorized) {
      throw new NotFoundException({
        code: 'PRIVACY_REQUEST_NOT_FOUND',
        message: 'Không tìm thấy yêu cầu quyền riêng tư trong phạm vi xác thực.',
      });
    }

    const events = await this.requestStore.listEvents(requestId);
    return { request, events };
  }
}
