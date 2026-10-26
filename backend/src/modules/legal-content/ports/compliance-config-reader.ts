import type { PublicBusinessInfo } from '../domain/policy-catalog.js';

export const COMPLIANCE_CONFIG_READER = Symbol('COMPLIANCE_CONFIG_READER');

export interface ComplianceConfigReader {
  getPublicBusinessInfo(): Promise<PublicBusinessInfo | null>;
  isProductionReady(): Promise<boolean>;
}
