import { Inject, Injectable } from '@nestjs/common';
import {
  POLICY_CATALOG_READER,
  type PolicyCatalogReader,
} from '../ports/policy-catalog-reader.js';
import type { PolicyDescriptor, BookingPolicyBundle } from '../domain/policy-catalog.js';

export interface PolicyCatalogResult {
  policies: PolicyDescriptor[];
  activeBookingBundle: BookingPolicyBundle;
}

@Injectable()
export class GetPolicyCatalogUseCase {
  constructor(
    @Inject(POLICY_CATALOG_READER)
    private readonly catalogReader: PolicyCatalogReader,
  ) {}

  async execute(locale = 'vi'): Promise<PolicyCatalogResult> {
    const policies = await this.catalogReader.getPublishedPolicies(locale);
    const activeBookingBundle = await this.catalogReader.getActiveBookingBundle();
    return {
      policies,
      activeBookingBundle,
    };
  }
}
