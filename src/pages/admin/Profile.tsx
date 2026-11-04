import { useAuth } from '../../auth';
import { BackLink } from '../../components/BackLink';
import { ChangePasswordForm } from '../../components/ChangePasswordForm';
import { DetailRow } from '../../components/ui';
import { date, humanize } from '../../format';

/** The signed-in admin's own account: the details the backend returns for /api/me, and a password change. */
export default function AdminProfile() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="admin-page page--narrow">
      <BackLink fallback="/admin" />
      <div className="admin-page__header">
        <div>
          <span className="eyebrow">Account</span>
          <h1>My profile</h1>
          <p className="muted">The account you are signed in with.</p>
        </div>
      </div>

      <section className="card stack" aria-labelledby="admin-account-title">
        <h2 id="admin-account-title">Account details</h2>
        <dl className="small">
          <DetailRow label="Name">{user.fullName}</DetailRow>
          <DetailRow label="Email">{user.email}</DetailRow>
          {user.phone && <DetailRow label="Phone">{user.phone}</DetailRow>}
          <DetailRow label="Role">{humanize(user.role)}</DetailRow>
          {user.createdAt && <DetailRow label="Account created">{date(user.createdAt)}</DetailRow>}
        </dl>
      </section>

      <ChangePasswordForm />
    </div>
  );
}
