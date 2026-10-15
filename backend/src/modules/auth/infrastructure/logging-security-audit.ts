import { Injectable, Logger } from '@nestjs/common';
import { SecurityAudit, type SecurityEvent } from '../ports/security-audit.js';

const ACTIONS = new Set([
  'login',
  'register',
  'logout',
  'verify-email',
  'reset-password',
  'forgot-password',
  'resend-verification',
]);
const OUTCOMES = new Set(['success', 'denied', 'throttled', 'unavailable']);
const REQUEST_ID = /^[a-f0-9-]{36}$/;

@Injectable()
export class LoggingSecurityAudit extends SecurityAudit {
  private readonly logger = new Logger('SecurityAudit');
  private readonly totals = new Map<string, number>();
  private writeFailures = 0;

  record(event: SecurityEvent): void {
    if (
      !ACTIONS.has(event.action) ||
      !OUTCOMES.has(event.outcome) ||
      !REQUEST_ID.test(event.requestId)
    )
      return;
    const code = `auth.${event.action}.${event.outcome}`;
    this.totals.set(code, (this.totals.get(code) ?? 0) + 1);
    try {
      this.logger.log(JSON.stringify({ code, requestId: event.requestId }));
    } catch {
      this.writeFailures++;
    } // Audit sink failure must never undo a revoke.
  }

  snapshot(): { totals: Record<string, number>; writeFailures: number } {
    return {
      totals: Object.fromEntries(this.totals),
      writeFailures: this.writeFailures,
    };
  }
}
