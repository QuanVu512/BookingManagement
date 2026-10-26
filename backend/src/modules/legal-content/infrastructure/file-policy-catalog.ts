import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  BookingPolicyBundle,
  PolicyDescriptor,
  PolicyKind,
  PublicBusinessInfo,
} from '../domain/policy-catalog.js';
import type { PolicyCatalogReader } from '../ports/policy-catalog-reader.js';
import type { ComplianceConfigReader } from '../ports/compliance-config-reader.js';

interface ManifestSchema {
  manifestVersion: string;
  business?: PublicBusinessInfo & { publicationStatus?: string };
  activeBookingBundle: BookingPolicyBundle;
  policies: PolicyDescriptor[];
}

@Injectable()
export class FilePolicyCatalog implements PolicyCatalogReader, ComplianceConfigReader {
  private manifestCache: ManifestSchema | null = null;

  private loadManifest(): ManifestSchema {
    if (this.manifestCache) {
      return this.manifestCache;
    }
    try {
      const candidates = [
        resolve(process.cwd(), 'backend/src/modules/legal-content/content/policy-manifest.json'),
        resolve(process.cwd(), 'src/modules/legal-content/content/policy-manifest.json'),
        new URL('../content/policy-manifest.json', import.meta.url),
      ];

      for (const target of candidates) {
        try {
          const raw = readFileSync(target, 'utf-8');
          this.manifestCache = JSON.parse(raw) as ManifestSchema;
          return this.manifestCache;
        } catch {
          // try next candidate
        }
      }
      throw new Error('Manifest not found in candidate paths');
    } catch (error) {
      throw new ServiceUnavailableException({
        code: 'LEGAL_CONFIGURATION_UNAVAILABLE',
        message: 'Không thể nạp manifest chính sách pháp lý.',
      });
    }
  }

  async getPublishedPolicies(locale = 'vi'): Promise<PolicyDescriptor[]> {
    const manifest = this.loadManifest();
    return manifest.policies.filter(
      (p) => p.publicationStatus === 'PUBLISHED' && (!locale || p.locale === locale),
    );
  }

  async getPolicyByKindAndVersion(
    kind: PolicyKind,
    version: string,
    locale = 'vi',
  ): Promise<PolicyDescriptor | null> {
    const manifest = this.loadManifest();
    const found = manifest.policies.find(
      (p) => p.kind === kind && p.version === version && (!locale || p.locale === locale),
    );
    return found ?? null;
  }

  async getActiveBookingBundle(): Promise<BookingPolicyBundle> {
    const manifest = this.loadManifest();
    if (!manifest.activeBookingBundle || !manifest.activeBookingBundle.published) {
      throw new ServiceUnavailableException({
        code: 'ACTIVE_BUNDLE_UNAVAILABLE',
        message: 'Chưa cấu hình bundle chính sách giao kết đặt sân.',
      });
    }
    return manifest.activeBookingBundle;
  }

  async getPublicBusinessInfo(): Promise<PublicBusinessInfo | null> {
    const manifest = this.loadManifest();
    if (!manifest.business || manifest.business.publicationStatus !== 'PUBLISHED') {
      return null;
    }
    return manifest.business;
  }

  async isProductionReady(): Promise<boolean> {
    const manifest = this.loadManifest();
    return Boolean(
      manifest.business &&
        manifest.business.publicationStatus === 'PUBLISHED' &&
        manifest.business.verifiedAt &&
        manifest.activeBookingBundle &&
        manifest.activeBookingBundle.published,
    );
  }
}
