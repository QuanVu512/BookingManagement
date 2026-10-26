import { Inject, Injectable } from '@nestjs/common';
import {
  POLICY_CATALOG_READER,
  type PolicyCatalogReader,
} from '../ports/policy-catalog-reader.js';
import type { BookingPolicyBundle } from '../domain/policy-catalog.js';

@Injectable()
export class ResolveBookingPolicyBundleUseCase {
  constructor(
    @Inject(POLICY_CATALOG_READER)
    private readonly catalogReader: PolicyCatalogReader,
  ) {}

  async execute(): Promise<BookingPolicyBundle> {
    return this.catalogReader.getActiveBookingBundle();
  }
}
