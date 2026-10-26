import { Controller, Get, Header, Query, ServiceUnavailableException } from '@nestjs/common';
import { GetPolicyCatalogUseCase } from '../application/get-policy-catalog.use-case.js';
import { ResolveBookingPolicyBundleUseCase } from '../application/resolve-booking-policy-bundle.use-case.js';
import { FilePolicyCatalog } from '../infrastructure/file-policy-catalog.js';

@Controller('legal')
export class LegalContentController {
  constructor(
    private readonly getPolicyCatalogUseCase: GetPolicyCatalogUseCase,
    private readonly resolveBookingPolicyBundleUseCase: ResolveBookingPolicyBundleUseCase,
    private readonly filePolicyCatalog: FilePolicyCatalog,
  ) {}

  @Get('policies')
  @Header('Cache-Control', 'public, max-age=300')
  async getPolicies(@Query('locale') locale?: string) {
    const result = await this.getPolicyCatalogUseCase.execute(locale || 'vi');
    return {
      success: true,
      data: result,
    };
  }

  @Get('booking-offer')
  @Header('Cache-Control', 'no-store')
  async getBookingOffer() {
    const bundle = await this.resolveBookingPolicyBundleUseCase.execute();
    return {
      success: true,
      data: bundle,
    };
  }

  @Get('business')
  @Header('Cache-Control', 'public, max-age=300')
  async getBusinessInfo() {
    const info = await this.filePolicyCatalog.getPublicBusinessInfo();
    if (!info) {
      throw new ServiceUnavailableException({
        code: 'BUSINESS_INFO_NOT_PUBLISHED',
        message: 'Thông tin pháp nhân chưa được chủ sở hữu phê duyệt công bố.',
      });
    }
    return {
      success: true,
      data: info,
    };
  }
}
