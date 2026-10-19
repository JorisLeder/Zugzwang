/**
 * Account section for the settings page (PRD Datenschutz, DoD "Konto-Export und -Löschung"): JSON export of all
 * user data, sign-out (cloud), delete (local: wipe this device; cloud: delete the account on the server, then sign
 * out) after typing a confirmation word.
 */
import { Download, LogOut, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { useSubscribable } from '@/lib/observable';
import { Button, Card, Dialog, DialogClose, DialogContent } from '@/ui/primitives';
import { downloadBlob, exportFileName } from './session';
import { STRINGS_DE } from './strings.de';

const A = STRINGS_DE.account;

/** Konto und Daten. */
export function AccountSection() {
  const { data } = useServices();
  const navigate = useNavigate();
  const id = useId();
  const cloud = data.auth.mode === 'cloud';
  const source = useMemo(() => data.auth.observe(), [data]);
  const session = useSubscribable(source, data.auth.session());
  const [busy, setBusy] = useState<'export' | 'delete' | 'signout' | 'sync' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncError, setSyncError] = useState(false);

  async function exportData() {
    setBusy('export');
    setMessage(null);
    try {
      downloadBlob(await data.account.exportData(), exportFileName());
      setMessage({ tone: 'ok', text: A.exportDone });
    } catch {
      setMessage({ tone: 'error', text: A.exportFailed });
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy('signout');
    try {
      await data.auth.signOut();
      setSignOutOpen(false);
      navigate(paths.login(), { replace: true });
    } finally {
      setBusy(null);
    }
  }

  /** Unsynced progress would be lost if another account logs in on this device: ask first. */
  function requestSignOut() {
    const pending = data.sync.state().pending;
    if (pending > 0) {
      setPendingCount(pending);
      setSyncError(false);
      setSignOutOpen(true);
    } else {
      void signOut();
    }
  }

  /** "Erst synchronisieren": flush; sign out only if nothing is left, otherwise stay and say so. */
  async function syncThenSignOut() {
    setBusy('sync');
    setSyncError(false);
    try {
      await data.sync.flush();
    } catch {
      // The state below tells whether anything is left.
    }
    const left = data.sync.state().pending;
    setBusy(null);
    if (left > 0) {
      setPendingCount(left);
      setSyncError(true);
      return;
    }
    await signOut();
  }

  async function deleteAll() {
    setBusy('delete');
    setMessage(null);
    try {
      await data.account.deleteAccount();
      setConfirmOpen(false);
      setConfirmText('');
      setMessage({ tone: 'ok', text: A.deleted });
      navigate(cloud ? paths.login() : paths.onboarding(), { replace: true });
    } catch {
      setMessage({ tone: 'error', text: A.deleteFailed });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4" data-testid="account-section">
      <h2 className="text-h2 text-text">{A.title}</h2>
      <p className="text-body-sm text-muted">
        {cloud ? (session?.email ? A.loggedInAs(session.email) : A.loggedIn) : A.localIntro}
      </p>
      <div className="flex flex-col gap-1">
        <div>
          <Button variant="secondary" icon={<Download />} loading={busy === 'export'} disabled={busy !== null} onClick={() => void exportData()}>
            {busy === 'export' ? A.exporting : A.exportLabel}
          </Button>
        </div>
        <p className="text-caption text-muted">{A.exportHint}</p>
      </div>
      {cloud && (
        <div>
          <Button variant="secondary" icon={<LogOut />} loading={busy === 'signout'} disabled={busy !== null} onClick={requestSignOut}>
            {A.signOut}
          </Button>
        </div>
      )}
      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        {signOutOpen && (
          <DialogContent title={A.signOutPendingTitle} description={A.signOutPendingBody(pendingCount)}>
            {syncError && (
              <p role="alert" className="text-body-sm text-danger-text">
                {A.syncFailed}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost" disabled={busy !== null}>
                  {A.cancel}
                </Button>
              </DialogClose>
              <Button variant="secondary" loading={busy === 'sync'} disabled={busy !== null} onClick={() => void syncThenSignOut()}>
                {busy === 'sync' ? A.syncing : A.syncFirst}
              </Button>
              <Button variant="danger" loading={busy === 'signout'} disabled={busy !== null} onClick={() => void signOut()}>
                {A.signOutAnyway}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setConfirmText('');
        }}
      >
        <div className="flex flex-col gap-1">
          <div>
            <Button variant="danger" icon={<Trash2 />} disabled={busy !== null} onClick={() => setConfirmOpen(true)}>
              {cloud ? A.deleteCloud : A.deleteLocal}
            </Button>
          </div>
          <p className="text-caption text-muted">{cloud ? A.deleteHintCloud : A.deleteHintLocal}</p>
        </div>
        {confirmOpen && (
          <DialogContent title={cloud ? A.confirmTitleCloud : A.confirmTitleLocal} description={A.confirmBody}>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (confirmText.trim().toUpperCase() === A.confirmWord) void deleteAll();
              }}
            >
              <label htmlFor={`${id}-confirm`} className="text-body-sm text-text">
                {A.confirmLabel(A.confirmWord)}
              </label>
              <input
                id={`${id}-confirm`}
                autoComplete="off"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="h-11 w-full min-w-0 rounded-md border border-border-strong bg-surface-2 px-3 text-body text-text"
              />
              <div className="flex flex-wrap justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="ghost">{A.cancel}</Button>
                </DialogClose>
                <Button type="submit" variant="danger" loading={busy === 'delete'} disabled={confirmText.trim().toUpperCase() !== A.confirmWord || busy !== null}>
                  {busy === 'delete' ? A.deleting : A.confirm}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-body-sm text-danger-text' : 'text-body-sm text-muted'}>
          {message.text}
        </p>
      )}
    </Card>
  );
}
