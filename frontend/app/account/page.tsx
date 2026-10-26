'use client';

import { useAuthActions, useAuthSession } from '../../context/auth-context';
import { AccountShell } from '../../components/account/account-shell';
import { AccountProfileView } from '../../components/account/account-profile-view';
import { ProfileEditForm } from '../../features/account/components/profile-edit-form';

export default function AccountPage() {
  const session = useAuthSession();
  const actions = useAuthActions();
  const reload = () => void actions.refreshSession();
  return (
    <AccountShell
      title="Thông tin cá nhân"
      status={session.status}
      sessionLoading={session.isLoading}
      sessionError={session.sessionError}
      onSignIn={() => actions.openSignIn()}
      onRetrySession={reload}
    >
      {session.user ? <AccountProfileView user={session.user} /> : null}
      {session.user ? (
        <ProfileEditForm
          key={session.user.fullName}
          initialFullName={session.user.fullName}
          initialAvatarUrl={null}
          onSaved={reload}
        />
      ) : null}
    </AccountShell>
  );
}
