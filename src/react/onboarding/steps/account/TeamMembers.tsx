/**
 * TeamMembers sub-step of the Account onboarding step.
 * Lists existing users (excluding account owner) and allows adding/removing them.
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { Extension } from '../../../../types/dial-plan';
import { useOnboarding } from '../../OnboardingContext';
import { StepNavigation } from '../../StepNavigation';
import { UserIcon, TrashIcon } from '../../components/icons';
import { ErrorAlert } from '../../components/ErrorAlert';

export interface TeamMembersProps {
  accountEmail: string;
  onBack: () => void;
  onDone: () => void;
}

function getNextExtensionNumber(extensions: Extension[]): string {
  if (extensions.length === 0) return '101';
  const numbers = extensions.map((e) => parseInt(e.number, 10)).filter((n) => !isNaN(n));
  if (numbers.length === 0) return '101';
  return String(Math.max(...numbers) + 1);
}

function getExtensionForUser(userId: string, extensions: Extension[]): Extension | undefined {
  return extensions.find((e) => e.target === userId);
}

export const TeamMembers: React.FC<TeamMembersProps> = ({ accountEmail, onBack, onDone }) => {
  const {
    dialstack,
    progressStore,
    locale,
    users: contextUsers,
    extensions: contextExtensions,
    reloadSharedData,
  } = useOnboarding();
  const t = locale.accountOnboarding.account;
  const nav = locale.accountOnboarding.nav;

  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserExtension, setNewUserExtension] = useState(() =>
    getNextExtensionNumber(contextExtensions)
  );

  const [isAddingUser, setIsAddingUser] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);

  const handleAddUser = useCallback(async () => {
    if (isAddingUser) return;
    setUserError(null);

    if (!newUserName.trim()) {
      setUserError(t.users.nameRequired);
      return;
    }
    if (!newUserEmail.trim() || !newUserEmail.includes('@')) {
      setUserError(locale.accountOnboarding.account.details.emailRequired);
      return;
    }

    setIsAddingUser(true);

    try {
      const user = await dialstack.users.create({
        name: newUserName.trim(),
        email: newUserEmail.trim(),
      });

      const extNumber = newUserExtension.trim() || getNextExtensionNumber(contextExtensions);

      try {
        await dialstack.extensions.create({
          number: extNumber,
          target: user.id,
        });
      } catch (extErr) {
        // Roll back user creation on extension failure
        await dialstack.users.del(user.id).catch(() => {});
        throw extErr;
      }

      await reloadSharedData();
      setNewUserName('');
      setNewUserEmail('');
      // newUserExtension will update via the effect below
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already exists')) {
        setUserError(t.users.duplicateEmail);
      } else {
        setUserError(message);
      }
    } finally {
      setIsAddingUser(false);
    }
  }, [
    isAddingUser,
    newUserName,
    newUserEmail,
    newUserExtension,
    contextExtensions,
    dialstack,
    reloadSharedData,
    t,
    locale,
  ]);

  const handleRemoveUser = useCallback(
    async (userId: string) => {
      if (deletingUserId) return;
      setDeletingUserId(userId);
      try {
        await dialstack.users.del(userId);
        await reloadSharedData();
      } catch (err) {
        setUserError(err instanceof Error ? err.message : String(err));
      } finally {
        setDeletingUserId(null);
      }
    },
    [deletingUserId, dialstack, reloadSharedData]
  );

  // Keep next-extension suggestion in sync with context extensions after mutations.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resync suggestion after external context mutation
    setNewUserExtension(getNextExtensionNumber(contextExtensions));
  }, [contextExtensions]);

  const handleDone = useCallback(() => {
    const otherUsers = accountEmail
      ? contextUsers.filter((u) => u.email?.toLowerCase() !== accountEmail.toLowerCase())
      : contextUsers;
    if (otherUsers.length === 0) {
      setUserError(t.users.atLeastOne);
      return;
    }
    progressStore.completeSubStep('account', 'team-members');
    onDone();
  }, [contextUsers, accountEmail, progressStore, onDone, t]);

  const otherUsers = contextUsers.filter(
    (u) => u.email?.toLowerCase() !== accountEmail.toLowerCase()
  );

  return (
    <div>
      <div className="card">
        <h2 className="section-title">{t.users.heading}</h2>
        <p className="section-subtitle">{t.users.description}</p>

        <div className="add-user-form">
          <div className="form-group">
            <label className="form-label">{t.users.nameLabel}</label>
            <input
              className="form-input"
              type="text"
              value={newUserName}
              placeholder={t.users.namePlaceholder}
              onChange={(e) => setNewUserName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t.users.emailLabel}</label>
            <input
              className="form-input"
              type="email"
              value={newUserEmail}
              placeholder={t.users.emailPlaceholder}
              onChange={(e) => setNewUserEmail(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t.users.extensionLabel}</label>
            <input
              className="form-input"
              type="text"
              value={newUserExtension}
              placeholder={t.users.extensionPlaceholder}
              onChange={(e) => setNewUserExtension(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-add"
            onClick={() => void handleAddUser()}
            disabled={isAddingUser}
          >
            {isAddingUser ? t.saving : t.users.addUser}
          </button>
        </div>

        {otherUsers.length === 0 ? (
          <div className="no-users">{t.users.noUsers}</div>
        ) : (
          <table className="user-table">
            <thead>
              <tr>
                <th>{t.users.nameLabel}</th>
                <th>{t.users.emailLabel}</th>
                <th>{t.users.extensionLabel}</th>
                <th>{t.users.roleLabel}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {otherUsers.map((u) => {
                const ext = getExtensionForUser(u.id, contextExtensions);
                const isAdmin = u.account_role === 'admin';
                return (
                  <tr key={u.id}>
                    <td className="user-table-name">
                      <span className="user-avatar">
                        <UserIcon />
                      </span>
                      {u.name ?? ''}
                    </td>
                    <td>{u.email ?? ''}</td>
                    <td>{ext ? ext.number : '—'}</td>
                    <td className="user-table-role">
                      {isAdmin ? t.users.roleAdmin : t.users.roleUser}
                    </td>
                    <td>
                      {!isAdmin && (
                        <button
                          type="button"
                          className="btn-icon-danger"
                          title={t.users.removeUser}
                          disabled={!!deletingUserId}
                          onClick={() => void handleRemoveUser(u.id)}
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <ErrorAlert message={userError} />
      </div>

      <StepNavigation
        onBack={onBack}
        backLabel={`\u2190 ${nav.back}`}
        onNext={handleDone}
        nextLabel={`${nav.next} \u2192`}
      />
    </div>
  );
};
