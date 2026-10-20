import type { ReactNode } from 'react';
import { SportyHeader } from '../../components/home/sporty-header';
import { AuthModal } from '../../components/auth/auth-modal';

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SportyHeader currentPage="court-detail" />
      {children}
      <AuthModal />
    </>
  );
}
