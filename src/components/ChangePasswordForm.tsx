import { FormEvent, useId, useState } from 'react';
import { api } from '../api';
import { useAction } from '../hooks';
import { passwordChangeProblem } from '../account';
import { ErrorAlert } from './ui';

/**
 * Change the signed-in user's password (PUT /api/me/password), for customers and admins. The backend checks the
 * current password and hashes the new one; the confirmation is checked here and never sent.
 */
export function ChangePasswordForm() {
  const ids = { title: useId(), current: useId(), next: useId(), confirm: useId(), hint: useId() };
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const action = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setDone(false);
    const issue = passwordChangeProblem(current, next, confirm);
    setProblem(issue);
    if (issue) return;
    // 204 No Content resolves to undefined, so success is made explicit (run() returns undefined on failure).
    const ok = await action.run(() =>
      api.put<void>('/me/password', { currentPassword: current, newPassword: next }).then(() => true),
    );
    if (ok) {
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    }
  };

  return (
    <section className="card stack" aria-labelledby={ids.title}>
      <h2 id={ids.title}>Change password</h2>
      <form className="stack" onSubmit={submit} noValidate>
        <label htmlFor={ids.current}>
          Current password
          <input
            id={ids.current}
            type="password"
            autoComplete="current-password"
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
        {done && (
          <div className="alert success" role="status">
            Your password has been changed.
          </div>
        )}
        <button type="submit" className="primary" disabled={action.busy} style={{ alignSelf: 'flex-start' }}>
          {action.busy ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </section>
  );
}
