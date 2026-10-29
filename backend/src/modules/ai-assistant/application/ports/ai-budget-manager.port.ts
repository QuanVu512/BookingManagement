export type AiReservationStatus = 'RESERVED' | 'SETTLED' | 'HELD_CONSERVATIVE';

export interface AiBudgetReserveInput {
  reservationId: string;
  reserveTokens: number;
  bucketDate: string;
  quotaLimit: number;
}

export interface AiBudgetSettleInput {
  reservationId: string;
  actualTokens: number;
}

export interface AiBudgetReserveResult {
  allowed: boolean;
}

export interface AiBudgetSettleResult {
  settled: boolean;
  refundedTokens: number;
}

export interface AiBudgetManagerPort {
  reserve(input: AiBudgetReserveInput): Promise<AiBudgetReserveResult>;
  settle(input: AiBudgetSettleInput): Promise<AiBudgetSettleResult>;
  markConservativeHeld(reservationId: string): Promise<void>;
}

export const AI_BUDGET_MANAGER_PORT = 'AI_BUDGET_MANAGER_PORT';
