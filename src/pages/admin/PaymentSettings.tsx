import { useEffect, useState, type ChangeEvent } from 'react';
import { api, postForm } from '../../api';
import { AuthImage } from '../../components/AuthImage';
import { ErrorAlert, Loading } from '../../components/ui';
import { dateTime } from '../../format';
import { useAction, useLoad } from '../../hooks';
import {
  ADMIN_QR_IMAGE_PATH,
  PAYMENT_SETTINGS_PATH,
  RECEIPT_ACCEPT,
  receiptProblem,
  SETTINGS_SAFETY_NOTE,
  settingsForm,
  settingsProblem,
  type SettingsForm,
} from '../../transfers';
import type { PaymentSettings as Settings } from '../../types';

/**
 * Admin → Payment settings: the QR code and the bank account customers pay into, and whether each is offered at
 * checkout. Only ADMIN and SUPER_ADMIN reach this page (and the backend checks again). Only public receiving details:
 * there is no field for a password, PIN, OTP, card number or banking login.
 */
export default function PaymentSettings() {
  const settings = useLoad(() => api.get<Settings>(PAYMENT_SETTINGS_PATH));
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saved, setSaved] = useState(false);
  const [imageVersion, setImageVersion] = useState(0);
  const [imageProblem, setImageProblem] = useState<string | null>(null);
  const save = useAction();
  const upload = useAction();

  useEffect(() => {
    if (settings.data) setForm(settingsForm(settings.data));
  }, [settings.data]);

  if (settings.loading && !settings.data) return <Loading />;
  if (!settings.data || !form) return <ErrorAlert error={settings.error} />;
  const s = settings.data;
  const problem = settingsProblem(form, s.qrImageUploaded);
  const set = (patch: Partial<SettingsForm>) => {
    setSaved(false);
    setForm({ ...form, ...patch });
  };
  const text = (key: keyof SettingsForm) => ({
    value: (form[key] as string | null) ?? '',
    onChange: (e: ChangeEvent<HTMLInputElement>) => set({ [key]: e.target.value } as Partial<SettingsForm>),
  });

  const doSave = async () => {
    if (problem) return;
    const res = await save.run(() => api.put<Settings>(PAYMENT_SETTINGS_PATH, form));
    if (res) {
      settings.setData(res);
      setSaved(true);
    }
  };

  const doUpload = async (file: File | null) => {
    if (!file) return;
    const issue = receiptProblem(file);
    setImageProblem(issue);
    if (issue) return;
    const data = new FormData();
    data.append('image', file);
    const res = await upload.run(() => postForm<Settings>(`${PAYMENT_SETTINGS_PATH}/qr-image`, data));
    if (res) {
      settings.setData(res);
      setImageVersion((v) => v + 1);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="eyebrow">Finance</span>
          <h1>
            Payment <span className="accent-text">settings</span>
          </h1>
          <p className="muted">
            QR payments and bank transfers customers make in their own app. You approve each one after checking that
            the money arrived.
          </p>
        </div>
      </div>
      <div className="alert info small" role="note">
        {SETTINGS_SAFETY_NOTE}
      </div>

      <section className="card stack" aria-labelledby="qr-title">
        <div className="checkout-task__head">
          <h2 id="qr-title">QR payment</h2>
          <span className={`badge ${s.qrEnabled ? 'green' : ''}`}>{s.qrEnabled ? 'Offered at checkout' : 'Off'}</span>
        </div>
        <label className="inline">
          <input type="checkbox" checked={form.qrEnabled} onChange={(e) => set({ qrEnabled: e.target.checked })} />
          QR payment enabled
        </label>
        <label>
          Display name / account name
          <input maxLength={100} {...text('qrDisplayName')} />
        </label>
        <label>
          Short instruction (optional)
          <input maxLength={300} {...text('qrInstructions')} />
        </label>
        <div className="stack">
          <span>QR image</span>
          {s.qrImageUploaded ? (
            <AuthImage path={`${ADMIN_QR_IMAGE_PATH}?v=${imageVersion}`} alt="Uploaded QR code" className="transfer-qr__image" />
          ) : (
            <p className="muted small">No QR image uploaded yet.</p>
          )}
          <label>
            {s.qrImageUploaded ? 'Replace the QR image' : 'Upload the QR image'}
            <input type="file" accept={RECEIPT_ACCEPT} onChange={(e) => doUpload(e.target.files?.[0] ?? null)} />
          </label>
          <p className="muted small">JPEG, PNG or WebP, up to 5 MB.</p>
          {imageProblem && (
            <div className="alert" role="alert">
              {imageProblem}
            </div>
          )}
          <ErrorAlert error={upload.error} />
          {upload.busy && <p className="muted small">Uploading…</p>}
        </div>
      </section>

      <section className="card stack" aria-labelledby="bank-title">
        <div className="checkout-task__head">
          <h2 id="bank-title">Bank transfer</h2>
          <span className={`badge ${s.bankEnabled ? 'green' : ''}`}>{s.bankEnabled ? 'Offered at checkout' : 'Off'}</span>
        </div>
        <label className="inline">
          <input type="checkbox" checked={form.bankEnabled} onChange={(e) => set({ bankEnabled: e.target.checked })} />
          Bank transfer enabled
        </label>
        <div className="grid-2">
          <label>
            Bank name
            <input maxLength={100} {...text('bankName')} />
          </label>
          <label>
            Account holder name
            <input maxLength={100} {...text('bankAccountHolder')} />
          </label>
          <label>
            Account number
            <input maxLength={34} inputMode="numeric" autoComplete="off" {...text('bankAccountNumber')} />
          </label>
          <label>
            Branch name
            <input maxLength={100} {...text('bankBranch')} />
          </label>
          <label>
            Branch code (optional)
            <input maxLength={10} autoComplete="off" {...text('bankBranchCode')} />
          </label>
          <label>
            Payment instruction (optional)
            <input maxLength={300} {...text('bankInstructions')} />
          </label>
        </div>
      </section>

      {problem && (
        <div className="alert" role="alert">
          {problem}
        </div>
      )}
      <ErrorAlert error={save.error} />
      {saved && (
        <div className="alert success" role="status">
          Payment settings saved.
        </div>
      )}
      <div className="row">
        <button className="primary" onClick={doSave} disabled={!!problem || save.busy}>
          {save.busy ? 'Saving…' : 'Save payment settings'}
        </button>
        {s.updatedAt && (
          <span className="muted small">
            Last changed {dateTime(s.updatedAt)}
            {s.updatedBy && ` by ${s.updatedBy}`}
          </span>
        )}
      </div>
    </div>
  );
}
