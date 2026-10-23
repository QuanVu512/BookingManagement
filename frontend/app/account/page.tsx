'use client';

import { useAuthActions, useAuthSession } from '../../context/auth-context';
import { AccountShell } from '../../components/account/account-shell';
import { AccountProfileView } from '../../components/account/account-profile-view';

export default function AccountPage() {
  const session = useAuthSession();
  const actions = useAuthActions();
  return (
    <AccountShell
      title="Thông tin cá nhân"
      status={session.status}
      sessionLoading={session.isLoading}
      sessionError={session.sessionError}
      onSignIn={() => actions.openSignIn()}
      onRetrySession={() => void actions.refreshSession()}
    >
      {session.user ? <AccountProfileView user={session.user} /> : null}
    </AccountShell>
  );
}
