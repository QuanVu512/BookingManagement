import { FilePolicyCatalog } from '../infrastructure/file-policy-catalog.js';
import { GetPolicyCatalogUseCase } from './get-policy-catalog.use-case.js';
import { ResolveBookingPolicyBundleUseCase } from './resolve-booking-policy-bundle.use-case.js';

describe('Legal Content Catalog & Bundle Resolution (Phase 1)', () => {
  let catalog: FilePolicyCatalog;
  let getCatalogUseCase: GetPolicyCatalogUseCase;
  let resolveBundleUseCase: ResolveBookingPolicyBundleUseCase;

  beforeEach(() => {
    catalog = new FilePolicyCatalog();
    getCatalogUseCase = new GetPolicyCatalogUseCase(catalog);
    resolveBundleUseCase = new ResolveBookingPolicyBundleUseCase(catalog);
  });

  it('T01-1: nạp danh mục 4 chính sách đã ban hành (PUBLISHED) cho tiếng Việt', async () => {
    const result = await getCatalogUseCase.execute('vi');
    expect(result.policies).toHaveLength(4);

    const kinds = result.policies.map((p) => p.kind);
    expect(kinds).toContain('privacy');
    expect(kinds).toContain('terms');
    expect(kinds).toContain('cookies');
    expect(kinds).toContain('refund-policy');

    for (const p of result.policies) {
      expect(p.publicationStatus).toBe('PUBLISHED');
      expect(p.locale).toBe('vi');
      expect(p.version).toBe('v1.0');
    }
  });

  it('T06-1: phân giải đúng activeBookingBundle hợp lệ', async () => {
    const bundle = await resolveBundleUseCase.execute();
    expect(bundle.id).toBe('bundle-2026-v1');
    expect(bundle.termsVersion).toBe('v1.0');
    expect(bundle.refundPolicyVersion).toBe('v1.0');
    expect(bundle.privacyVersion).toBe('v1.0');
    expect(bundle.published).toBe(true);
  });

  it('T05-1: chưa công bố business info khi chưa có phê duyệt chính thức từ chủ sở hữu', async () => {
    const info = await catalog.getPublicBusinessInfo();
    // Manifest sets publicationStatus to DRAFT_PENDING_OWNER until owner O01 decision is approved
    expect(info).toBeNull();
  });
});
