import { Module } from '@nestjs/common';
import { LegalContentController } from './presentation/legal-content.controller.js';
import { GetPolicyCatalogUseCase } from './application/get-policy-catalog.use-case.js';
import { ResolveBookingPolicyBundleUseCase } from './application/resolve-booking-policy-bundle.use-case.js';
import { FilePolicyCatalog } from './infrastructure/file-policy-catalog.js';
import { POLICY_CATALOG_READER } from './ports/policy-catalog-reader.js';
import { COMPLIANCE_CONFIG_READER } from './ports/compliance-config-reader.js';

@Module({
  controllers: [LegalContentController],
  providers: [
    FilePolicyCatalog,
    {
      provide: POLICY_CATALOG_READER,
      useExisting: FilePolicyCatalog,
    },
    {
      provide: COMPLIANCE_CONFIG_READER,
      useExisting: FilePolicyCatalog,
    },
    GetPolicyCatalogUseCase,
    ResolveBookingPolicyBundleUseCase,
  ],
  exports: [
    POLICY_CATALOG_READER,
    COMPLIANCE_CONFIG_READER,
    ResolveBookingPolicyBundleUseCase,
  ],
})
export class LegalContentModule {}
