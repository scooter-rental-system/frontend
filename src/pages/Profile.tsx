import { useAuth } from '../auth';
import { DetailRow } from '../components/ui';
import { date } from '../format';

/**
 * Profile page (FE-004): the signed-in customer's details from GET /api/me.
 * Read-only until the backend offers a profile update endpoint.
 */
export default function Profile() {
  const { user } = useAuth();
  if (!user) return null;
  const missing = <span className="muted">Not provided</span>;

  return (
    <div className="page page--narrow">
      <div className="page-header">
        <h1>Profile</h1>
        <p className="muted">The details on your account, used for your rental contracts.</p>
      </div>

      <section className="card">
        <h2 className="section-title">Contact</h2>
        <dl className="small">
          <DetailRow label="Full name">{user.fullName}</DetailRow>
          <DetailRow label="Email">{user.email}</DetailRow>
          <DetailRow label="Mobile">{user.phone || missing}</DetailRow>
          <DetailRow label="Country">{user.country || missing}</DetailRow>
        </dl>
      </section>

      <section className="card">
        <h2 className="section-title">Identity documents</h2>
        <dl className="small">
          <DetailRow label="NIC / Passport no.">{user.idDocumentNumber || missing}</DetailRow>
          <DetailRow label="Driving licence no.">{user.drivingLicenseNo || missing}</DetailRow>
        </dl>
      </section>

      <section className="card">
        <h2 className="section-title">Account</h2>
        <dl className="small">
          <DetailRow label="Status">{user.active ? 'Active' : 'Inactive'}</DetailRow>
          <DetailRow label="Member since">{date(user.createdAt)}</DetailRow>
        </dl>
      </section>
    </div>
  );
}
