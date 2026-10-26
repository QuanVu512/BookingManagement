export type PolicyKind = 'privacy' | 'terms' | 'cookies' | 'refund-policy';

export type PublicationStatus = 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';

export interface PolicySection {
  id: string;
  title: string;
  content: string;
  subsections?: Array<{
    id: string;
    title: string;
    content: string;
  }>;
}

export interface PolicyDescriptor {
  kind: PolicyKind;
  version: string;
  sha256: string;
  effectiveAt: string;
  updatedAt?: string;
  locale: string;
  publicPath: string;
  title: string;
  publicationStatus: PublicationStatus;
}

export interface PolicyDocument extends PolicyDescriptor {
  description: string;
  sections: PolicySection[];
}

export interface BookingPolicyBundle {
  id: string;
  termsVersion: string;
  refundPolicyVersion: string;
  privacyVersion: string;
  contentHash: string;
  effectiveAt: string;
  published: boolean;
}

export interface PublicBusinessInfo {
  legalName: string;
  tradeName: string;
  businessType: string;
  address: string;
  registrationIdentifier?: string;
  taxIdentifier?: string;
  publicEmail: string;
  publicPhone: string;
  supportHours?: string;
  rightsContact: string;
  verifiedAt?: string;
  approvedEvidenceRef?: string;
}
