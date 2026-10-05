/**
 * TeamMembers sub-step of the Account onboarding step.
 * Lists existing users and allows adding/removing them. Administrators with no
 * phone service (the account owner, to begin with) are listed too, with a
 * one-click way to give them a seat, so they are not re-added as duplicates.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { AdminUser, Extension } from '@dialstack/sdk-js';
import { useOnboarding } from '../../OnboardingContext';
import { StepNavigation } from '../../StepNavigation';
import { UserIcon, TrashIcon } from '../../components/icons';
import { ErrorAlert } from '../../components/ErrorAlert';
import { BillingImpactNotice } from '../../components/BillingImpactNotice';

export interface TeamMembersProps {
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

export const TeamMembers: React.FC<TeamMembersProps> = ({ onBack, onDone }) => {
  const {
    dialstack,
    locale,
    users: contextUsers,
    adminUsers,
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
  const [seatingAdminId, setSeatingAdminId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // One mutation at a time: each ends in reloadSharedData(), and two reloads
  // in flight can land out of order, restoring a stale snapshot.
  const busy = isAddingUser || !!seatingAdminId || !!deletingUserId;

  // Creates the user, then its extension, rolling the user back if the
  // extension fails so a retry doesn't hit a duplicate email. Returns whether
  // it succeeded; failures are reported through userError, after a reload so
  // the list shows a seat whose rollback failed rather than offering a retry
  // that can only hit "already exists".
  const addSeat = useCallback(
    async (name: string, email: string, extNumber: string): Promise<boolean> => {
      try {
        const user = await dialstack.users.create({ name, email });

        try {
          await dialstack.extensions.create({
            number: extNumber,
            target: user.id,
          });
        } catch (extErr) {
          await dialstack.users.del(user.id).catch(() => {});
          throw extErr;
        }

        await reloadSharedData();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('already exists')) {
          setUserError(t.users.duplicateEmail);
        } else {
          setUserError(message);
        }
        await reloadSharedData().catch(() => {});
        return false;
      }
    },
    [dialstack, reloadSharedData, t]
  );

  const handleAddUser = useCallback(async () => {
    if (busy) return;
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
    const added = await addSeat(
      newUserName.trim(),
      newUserEmail.trim(),
      newUserExtension.trim() || getNextExtensionNumber(contextExtensions)
    );
    if (added) {
      setNewUserName('');
      setNewUserEmail('');
      // newUserExtension will update via the effect below
    }
    setIsAddingUser(false);
  }, [busy, newUserName, newUserEmail, newUserExtension, contextExtensions, addSeat, t, locale]);

  const handleGivePhoneAccess = useCallback(
    async (admin: AdminUser) => {
      if (busy) return;
      setUserError(null);

      // A user needs a name, and an administrator who hasn't accepted their
      // invitation may not have one yet. Hand them to the form instead.
      const name = admin.name?.trim();
      if (!name) {
        setNewUserName('');
        setNewUserEmail(admin.email);
        nameInputRef.current?.focus();
        return;
      }

      setSeatingAdminId(admin.id);
      await addSeat(name, admin.email, getNextExtensionNumber(contextExtensions));
      setSeatingAdminId(null);
    },
    [busy, addSeat, contextExtensions]
  );

  const handleRemoveUser = useCallback(
    async (userId: string) => {
      if (busy) return;
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
    [busy, dialstack, reloadSharedData]
  );

  // Keep next-extension suggestion in sync with context extensions after mutations.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resync suggestion after external context mutation
    setNewUserExtension(getNextExtensionNumber(contextExtensions));
  }, [contextExtensions]);

  // Substep requires ≥1 user on the account. Administrators without phone
  // service are listed but don't count until they get a seat. Mirror the
  // derive's intent without letting the user advance past a still-incomplete
  // state.
  const hasEnoughUsers = contextUsers.length >= 1;

  const handleDone = useCallback(() => {
    if (!hasEnoughUsers) {
      setUserError(t.users.atLeastOne);
      return;
    }
    onDone();
  }, [hasEnoughUsers, onDone, t]);

  // The API links an administrator to their user; matching on email here would
  // second-guess it.
  const adminsWithoutSeat = adminUsers.filter((a) => a.user === null);
  const adminUserIds = new Set(adminUsers.map((a) => a.user).filter((id) => id !== null));

  return (
    <div>
      <div className="card">
        <h2 className="section-title">{t.users.heading}</h2>
        <p className="section-subtitle">{t.users.description}</p>

        <div className="add-user-form">
          <div className="form-group">
            <label className="form-label">{t.users.nameLabel}</label>
            <input
              ref={nameInputRef}
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
            disabled={busy}
          >
            {isAddingUser ? t.saving : t.users.addUser}
          </button>
        </div>

        {/* A rate, not a total: this form is used repeatedly and sits above the
            members already added, so a per-add total would read as a claim
            about the account and go stale after the first member. */}
        <BillingImpactNotice resource="userSeat" count={1} variant="rate" />

        {contextUsers.length === 0 && adminsWithoutSeat.length === 0 ? (
          <div className="no-users">{t.users.noUsers}</div>
        ) : (
          <table className="user-table">
            <thead>
              <tr>
                <th>{t.users.nameLabel}</th>
                <th>{t.users.emailLabel}</th>
                <th>{t.users.extensionLabel}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {adminsWithoutSeat.map((a) => (
                <tr key={a.id}>
                  <td className="user-table-name">
                    <span className="user-avatar">
                      <UserIcon />
                    </span>
                    {a.name ?? ''}
                    <span className="user-admin-badge">{t.users.adminBadge}</span>
                  </td>
                  <td>{a.email}</td>
                  <td className="user-table-muted">{t.users.noPhoneService}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-give-phone"
                      disabled={busy}
                      onClick={() => void handleGivePhoneAccess(a)}
                    >
                      {seatingAdminId === a.id
                        ? t.users.givingPhoneAccess
                        : t.users.givePhoneAccess}
                    </button>
                  </td>
                </tr>
              ))}
              {contextUsers.map((u) => {
                const ext = getExtensionForUser(u.id, contextExtensions);
                // Deleting an administrator's user only drops their seat; they
                // stay an administrator and reappear above without one.
                const isAdmin = adminUserIds.has(u.id);
                return (
                  <tr key={u.id}>
                    <td className="user-table-name">
                      <span className="user-avatar">
                        <UserIcon />
                      </span>
                      {u.name ?? ''}
                      {isAdmin && <span className="user-admin-badge">{t.users.adminBadge}</span>}
                    </td>
                    <td>{u.email ?? ''}</td>
                    <td>{ext ? ext.number : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-icon-danger"
                        title={isAdmin ? t.users.removePhoneAccess : t.users.removeUser}
                        disabled={busy}
                        onClick={() => void handleRemoveUser(u.id)}
                      >
                        <TrashIcon />
                      </button>
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
        isNextDisabled={!hasEnoughUsers}
      />
    </div>
  );
};
