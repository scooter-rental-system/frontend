import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { BackLink } from '../components/BackLink';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { ErrorAlert } from '../components/ui';
import { date } from '../format';
import { useAction } from '../hooks';
import { nicError } from '../registration';
import type { User } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileForm {
  fullName:         string;
  phone:            string;
  country:          string;
  idDocumentNumber: string;
  drivingLicenseNo: string;
  nicNumber: string;
}

function toForm(u: User): ProfileForm {
  return {
    fullName:         u.fullName,
    phone:            u.phone            ?? '',
    country:          u.country          ?? '',
    idDocumentNumber: u.idDocumentNumber ?? '',
    drivingLicenseNo: u.drivingLicenseNo ?? '',
    nicNumber: '',
  };
}

/**
 * Profile page (FE-004 / FR-013): the signed-in customer's details.
 * Now editable via PUT /api/me — backend refreshed in auth context after save.
 */
export default function Profile() {
  const { user, refresh } = useAuth();
  const action = useAction();

  const [form, setForm]       = useState<ProfileForm>(() => toForm(user!));
  const [saved, setSaved]     = useState(false);
  const [nicProblem, setNicProblem] = useState('');

  // Keep form in sync if the user object changes (e.g. after another tab logs in)
  useEffect(() => {
    if (user) setForm(toForm(user));
  }, [user]);

  if (!user) return null;

  const set = (k: keyof ProfileForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const problem = user.hasNicNumber ? '' : nicError(form.nicNumber);
    setNicProblem(problem);
    if (problem) return;
    await action.run(async () => {
      const { nicNumber, ...profile } = form;
      await api.put<User>('/me', user.hasNicNumber ? profile : { ...profile, nicNumber });
      await refresh();         // update topbar name, etc.
      setSaved(true);
    });
  };

  return (
    <div className="page page--narrow">
      <BackLink fallback="/dashboard" />
      <div className="page-header">
        <h1>Profile</h1>
        <p className="muted">
          Update your personal details — changes are saved to your account immediately.
        </p>
      </div>

      <form onSubmit={submit} id="profile-form" noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* ── Contact ─────────────────────────────────────────────────── */}
          <section className="card">
            <h2 className="section-title">Contact</h2>
            <div className="form-grid" style={{ marginTop: '12px' }}>
              <label htmlFor="profile-fullName">
                Full name
                <input
                  id="profile-fullName"
                  autoComplete="name"
                  value={form.fullName}
                  onChange={set('fullName')}
                  required
                />
              </label>

              <label htmlFor="profile-phone">
                Mobile (WhatsApp)
                <input
                  id="profile-phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+94 77 …"
                  value={form.phone}
                  onChange={set('phone')}
                />
              </label>

              <label htmlFor="profile-country" style={{ gridColumn: '1 / -1' }}>
                Country
                <input
                  id="profile-country"
                  autoComplete="country-name"
                  placeholder="e.g. Sri Lanka"
                  value={form.country}
                  onChange={set('country')}
                />
              </label>

              {/* Email is read-only — changing email would require extra verification */}
              <label style={{ gridColumn: '1 / -1' }}>
                Email address
                <input
                  value={user.email}
                  disabled
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                  title="Email cannot be changed here"
                />
              </label>
            </div>
          </section>

          {/* ── Identity documents ────────────────────────────────────── */}
          <section className="card">
            <h2 className="section-title">Identity documents</h2>
            <div className="form-grid" style={{ marginTop: '12px' }}>
              <label htmlFor="profile-idDoc">
                Passport / Other ID
                <input
                  id="profile-idDoc"
                  autoComplete="off"
                  placeholder="Passport or foreign ID no."
                  value={form.idDocumentNumber}
                  onChange={set('idDocumentNumber')}
                />
              </label>

              <label htmlFor="profile-licence">
                Driving Licence / IDP no.
                <input
                  id="profile-licence"
                  autoComplete="off"
                  placeholder="e.g. B1234567"
                  value={form.drivingLicenseNo}
                  onChange={set('drivingLicenseNo')}
                />
              </label>
              {!user.hasNicNumber && (
                <label htmlFor="profile-nicNumber">
                  Sri Lankan NIC Number <span className="required">*</span>
                  <input
                    id="profile-nicNumber"
                    autoComplete="off"
                    maxLength={20}
                    value={form.nicNumber}
                    onChange={(e) => {
                      setNicProblem('');
                      set('nicNumber')(e);
                    }}
                    aria-invalid={!!nicProblem}
                    aria-describedby={nicProblem ? 'profile-nic-error' : 'profile-nic-hint'}
                    className={nicProblem ? 'input-error' : ''}
                    required
                  />
                  {nicProblem ? (
                    <span id="profile-nic-error" className="field-error" role="alert">{nicProblem}</span>
                  ) : (
                    <span id="profile-nic-hint" className="muted small">
                      Required to complete your account. It cannot be changed after you add it.
                    </span>
                  )}
                </label>
              )}
            </div>
          </section>

          {/* ── Account (read-only) ───────────────────────────────────── */}
          <section className="card">
            <h2 className="section-title">Account</h2>
            <dl className="small" style={{ marginTop: '8px' }}>
              <div className="detail-row">
                <dt>Status</dt>
                <dd>{user.active ? 'Active' : 'Inactive'}</dd>
              </div>
              <div className="detail-row">
                <dt>Member since</dt>
                <dd>{date(user.createdAt)}</dd>
              </div>
              <div className="detail-row">
                <dt>NIC Number</dt>
                <dd>{user.hasNicNumber ? 'Provided' : 'Not provided'}</dd>
              </div>
            </dl>
          </section>

          {/* ── Actions ───────────────────────────────────────────────── */}
          <ErrorAlert error={action.error} />

          {saved && !action.error && (
            <div className="alert success" role="status">
              ✅ Profile updated successfully.
            </div>
          )}

          <button
            id="btn-profile-save"
            type="submit"
            className="btn-primary"
            disabled={action.busy}
            style={{ alignSelf: 'flex-start' }}
          >
            {action.busy ? 'Saving…' : 'Save changes'}
          </button>

        </div>
      </form>

      <ChangePasswordForm />
    </div>
  );
}
