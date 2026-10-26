import type { ReactNode } from 'react';
import { SportyHeader } from '../../components/home/sporty-header';
import { LegalFooter } from '../../features/legal/components/legal-footer';

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SportyHeader currentPage="court-detail" />
      <div style={{ minHeight: 'calc(100vh - 200px)' }}>
        {children}
      </div>
      <LegalFooter />
    </>
  );
}
