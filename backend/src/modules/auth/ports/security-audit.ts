export type SecurityAction =
  | 'login'
  | 'register'
  | 'logout'
  | 'verify-email'
  | 'reset-password'
  | 'forgot-password'
  | 'resend-verification';
export type SecurityOutcome =
  'success' | 'denied' | 'throttled' | 'unavailable';
export interface SecurityEvent {
  action: SecurityAction;
  outcome: SecurityOutcome;
  requestId: string;
}
export abstract class SecurityAudit {
  abstract record(event: SecurityEvent): void;
}
