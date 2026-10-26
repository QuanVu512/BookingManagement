export type PolicyKind = 'privacy' | 'terms' | 'cookies' | 'refund-policy';

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

export interface PolicyDocument {
  kind: PolicyKind;
  version: string;
  title: string;
  description: string;
  effectiveAt: string;
  updatedAt?: string;
  locale: string;
  publicPath: string;
  publicationStatus: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
  sections: PolicySection[];
}

export interface LegalManifest {
  manifestVersion: string;
  generatedAt: string;
  policies: Array<{
    kind: PolicyKind;
    version: string;
    sha256: string;
    effectiveAt: string;
    locale: string;
    publicPath: string;
    title: string;
    publicationStatus: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
  }>;
}
