import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { api } from '../api';
import { useAction } from '../hooks';
import { passwordChangeProblem } from '../account';
import { ErrorAlert } from './ui';

/**
 * "Change password" for customers and admins: a button that opens an accessible dialog (PUT /api/me/password).
 * The backend checks the current password and hashes the new one; the confirmation is checked here and never sent.
 * After a successful change the dialog closes (its fields go with it) and the page announces the change.
 */
export function ChangePasswordForm() {
  const [open, setOpen] = useState(false);
  const [changed, setChanged] = useState(false);
  const titleId = useId();

  return (
    <section className="card stack" aria-labelledby={titleId}>
      <h2 id={titleId}>Password</h2>
      <p className="muted small">Change the password you use to sign in.</p>
      {changed && (
        <div className="alert success" role="status">
          Your password has been changed.
        </div>
      )}
      <button
        type="button"
        className="btn-change-password"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => {
          setChanged(false);
          setOpen(true);
        }}
      >
        Change password
      </button>
      {open && (
        <ChangePasswordDialog
          onClose={() => setOpen(false)}
          onChanged={() => {
            setOpen(false);
            setChanged(true);
          }}
        />
      )}
    </section>
  );
}

/**
 * A modal <dialog> (showModal: focus moves in, the page behind is inert). Escape and Cancel close it, except while
 * the change is being sent; focus returns to the button that opened it.
 */
function ChangePasswordDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const ids = { title: useId(), current: useId(), next: useId(), confirm: useId(), hint: useId() };
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const action = useAction();

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      trigger?.focus();
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const issue = passwordChangeProblem(current, next, confirm);
    setProblem(issue);
    if (issue) return;
    // 204 No Content resolves to undefined, so success is made explicit (run() returns undefined on failure).
    const ok = await action.run(() =>
      api.put<void>('/me/password', { currentPassword: current, newPassword: next }).then(() => true),
    );
    if (ok) onChanged();
  };

  return (
    <dialog
      ref={ref}
      className="confirm-dialog password-dialog"
      aria-labelledby={ids.title}
      onCancel={(e) => {
        // Escape: close through React state, but not while the change is being sent.
        e.preventDefault();
        if (!action.busy) onClose();
      }}
    >
      <h2 id={ids.title} className="confirm-dialog__title">
        Change password
      </h2>
      <form className="stack" onSubmit={submit} noValidate>
        <label htmlFor={ids.current}>
          Current password
          <input
            id={ids.current}
            type="password"
            autoComplete="current-password"
            autoFocus
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label htmlFor={ids.next}>
          New password
          <input
            id={ids.next}
            type="password"
            autoComplete="new-password"
            maxLength={72}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-describedby={ids.hint}
          />
          <span id={ids.hint} className="field-hint">
            8 to 72 characters, different from your current password.
          </span>
        </label>
        <label htmlFor={ids.confirm}>
          Confirm new password
          <input
            id={ids.confirm}
            type="password"
            autoComplete="new-password"
            maxLength={72}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <ErrorAlert error={problem ?? action.error} />
        <div className="confirm-dialog__actions">
          <button type="button" onClick={onClose} disabled={action.busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={action.busy}>
            {action.busy ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
