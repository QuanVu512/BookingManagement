'use client';

import { useAuthActions, useAuthSession } from '../../../context/auth-context';
import { AccountShell } from '../../../components/account/account-shell';
import { AccountSecurityView } from '../../../components/account/account-security-view';

export default function AccountSecurityPage() {
  const session = useAuthSession();
  const actions = useAuthActions();
  return (
    <AccountShell
      title="Bảo mật tài khoản"
      status={session.status}
      sessionLoading={session.isLoading}
      sessionError={session.sessionError}
      onSignIn={() => actions.openAuthModal()}
      onRetrySession={() => void actions.refreshSession()}
    >
      <AccountSecurityView />
    </AccountShell>
  );
}
