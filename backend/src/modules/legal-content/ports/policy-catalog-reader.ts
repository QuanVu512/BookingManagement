import type {
  BookingPolicyBundle,
  PolicyDescriptor,
  PolicyKind,
} from '../domain/policy-catalog.js';

export const POLICY_CATALOG_READER = Symbol('POLICY_CATALOG_READER');

export interface PolicyCatalogReader {
  getPublishedPolicies(locale?: string): Promise<PolicyDescriptor[]>;
  getPolicyByKindAndVersion(
    kind: PolicyKind,
    version: string,
    locale?: string,
  ): Promise<PolicyDescriptor | null>;
  getActiveBookingBundle(): Promise<BookingPolicyBundle>;
}
