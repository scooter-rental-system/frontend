import { useState } from 'react';
import { api } from '../../api';
import { maintenanceCounts } from '../../admin';
import { Empty, ErrorAlert, Loading, StatusBadge } from '../../components/ui';
import { date, humanize, money, today } from '../../format';
import { useAction, useLoad } from '../../hooks';
import type { MaintenanceRecord, Scooter } from '../../types';

export default function Maintenance() {
  const list = useLoad(() => api.get<MaintenanceRecord[]>('/admin/maintenance'));
  const scooters = useLoad(() => api.get<Scooter[]>('/admin/scooters'));
  const [form, setForm] = useState({ scooterId: '', type: 'SERVICE', description: '', scheduledDate: today(), startNow: false });
  const [completing, setCompleting] = useState<MaintenanceRecord | null>(null);
  const [cost, setCost] = useState('');
  const [odo, setOdo] = useState('');
  const action = useAction();
  const counts = list.data ? maintenanceCounts(list.data) : null;

  const create = async () => {
    const res = await action.run(() => api.post('/admin/maintenance', form));
    if (res) {
      setForm({ ...form, description: '' });
      list.reload();
    }
  };

  const act = async (m: MaintenanceRecord, verb: 'start' | 'cancel') => {
    if (await action.run(() => api.post(`/admin/maintenance/${m.id}/${verb}`))) list.reload();
  };

  const complete = async () => {
    if (!completing) return;
    const res = await action.run(() =>
      api.post(`/admin/maintenance/${completing.id}/complete`, {
        cost: cost ? Number(cost) : null,
        odometerKm: odo ? Number(odo) : null,
      }),
    );
    if (res) {
      setCompleting(null);
      setCost('');
      setOdo('');
      list.reload();
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="eyebrow">Operations</span>
          <h1>
            Service <span className="accent-text">bay</span>
          </h1>
          <p className="muted">
            Maintenance work orders. Routine services are auto-scheduled every 3,000 km when a scooter is returned.
            Starting work takes the scooter out of service; completing it puts it back.
          </p>
        </div>
        {counts && (
          <dl className="header-stats" aria-label="Open work">
            <div className="header-stat">
              <dt>Open jobs</dt>
              <dd>{counts.open}</dd>
            </div>
            <div className={`header-stat${counts.inProgress > 0 ? ' is-attention' : ''}`}>
              <dt>In progress</dt>
              <dd>{counts.inProgress}</dd>
            </div>
          </dl>
        )}
      </div>

      {completing && (
        <section className="panel-card admin-form action-panel" aria-labelledby="complete-title">
          <h2 id="complete-title">
            Complete: {completing.scooterCode} {completing.type.toLowerCase()}
          </h2>
          <div className="form-grid">
            <label>
              Cost (LKR)
              <input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
            </label>
            <label>
              Odometer (km)
              <input type="number" value={odo} onChange={(e) => setOdo(e.target.value)} placeholder="unchanged" />
            </label>
          </div>
          <div className="admin-form__actions">
            <button className="primary" disabled={action.busy} onClick={complete}>
              Mark done
            </button>
            <button onClick={() => setCompleting(null)}>Close</button>
          </div>
        </section>
      )}

      <div className="split">
        <section className="panel-card" aria-labelledby="work-list-title">
          <div className="panel-card__head">
            <h2 id="work-list-title">Maintenance log</h2>
          </div>
          {list.loading && <Loading what="Loading maintenance" />}
          <ErrorAlert error={list.error} />
          {list.data?.length === 0 && <Empty>No maintenance work logged yet.</Empty>}
          {list.data && list.data.length > 0 && (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Scooter</th>
                    <th scope="col">Type</th>
                    <th scope="col">Description</th>
                    <th scope="col">Status</th>
                    <th scope="col">Scheduled</th>
                    <th scope="col" className="num">
                      Cost
                    </th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((m) => (
                    <tr key={m.id}>
                      <td data-label="Scooter">
                        {m.scooterCode}
                        <span className="cell-sub">{m.scooterModel}</span>
                      </td>
                      <td data-label="Type">{humanize(m.type)}</td>
                      <td data-label="Description" className="maintenance-description">
                        {m.description}
                      </td>
                      <td data-label="Status">
                        <StatusBadge status={m.status} />
                      </td>
                      <td data-label="Scheduled">
                        {date(m.scheduledDate)}
                        {m.completedDate && <span className="cell-sub">done {date(m.completedDate)}</span>}
                      </td>
                      <td data-label="Cost" className="num">
                        {money(m.cost)}
                      </td>
                      <td className="actions">
                        <div className="row">
                          {m.status === 'SCHEDULED' && (
                            <button className="small" disabled={action.busy} onClick={() => act(m, 'start')}>
                              Start
                            </button>
                          )}
                          {(m.status === 'SCHEDULED' || m.status === 'IN_PROGRESS') && (
                            <>
                              <button className="small primary" onClick={() => setCompleting(m)}>
                                Complete
                              </button>
                              <button className="small danger" disabled={action.busy} onClick={() => act(m, 'cancel')}>
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel-card admin-form" aria-labelledby="log-work-title">
          <h2 id="log-work-title">Log work</h2>
          <div className="stack">
            <label>
              Scooter
              <select value={form.scooterId} onChange={(e) => setForm({ ...form, scooterId: e.target.value })}>
                <option value="">Choose…</option>
                {scooters.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.model} ({s.status.toLowerCase()})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="SERVICE">Service</option>
                <option value="REPAIR">Repair</option>
                <option value="INSPECTION">Inspection</option>
              </select>
            </label>
            <label>
              Scheduled for
              <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
            </label>
          </div>
          <label>
            Description
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label className="inline">
            <input type="checkbox" checked={form.startNow} onChange={(e) => setForm({ ...form, startNow: e.target.checked })} />
            Start now (take scooter off the road)
          </label>
          <ErrorAlert error={action.error} />
          <div className="admin-form__actions">
            <button className="primary" disabled={!form.scooterId || !form.description || action.busy} onClick={create}>
              Save
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
