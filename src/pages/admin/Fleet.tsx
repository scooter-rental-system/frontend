import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { fleetCounts } from '../../admin';
import { Empty, ErrorAlert, Loading, ScooterThumb, StatusBadge } from '../../components/ui';
import { humanize, money } from '../../format';
import { useAction, useLoad } from '../../hooks';
import type { GearCategory, GearItem, Scooter, ScooterStatus } from '../../types';

const EMPTY_SCOOTER = {
  code: '',
  model: '',
  plateNumber: '',
  engineCc: '',
  hourlyRate: '',
  perKmRate: '',
  totalMileage: '0',
  imageUrl: '',
  description: '',
};

export function Fleet() {
  const list = useLoad(() => api.get<Scooter[]>('/admin/scooters'));
  const location = useLocation();
  const navigate = useNavigate();
  // The sidebar "Add scooter" button opens the form; the flag is cleared so a reload does not reopen it.
  const addRequested = (location.state as { addScooter?: boolean } | null)?.addScooter === true;
  const [editing, setEditing] = useState<Scooter | 'new' | null>(addRequested ? 'new' : null);
  const action = useAction();

  useEffect(() => {
    if (!addRequested) return;
    setEditing('new');
    navigate(location.pathname, { replace: true, state: null });
  }, [addRequested, location.pathname, navigate]);

  const counts = list.data ? fleetCounts(list.data) : null;

  const setStatus = async (s: Scooter, value: ScooterStatus) => {
    if (await action.run(() => api.patch(`/admin/scooters/${s.id}/status?value=${value}`))) list.reload();
  };

  // Leaving the fleet is a soft delete (SDS 8.3); history is kept and the scooter can be restored.
  const remove = async (s: Scooter) => {
    if (!window.confirm(`Remove ${s.code} from the fleet? It will no longer be bookable.`)) return;
    if (await action.run(() => api.delete(`/admin/scooters/${s.id}`))) list.reload();
  };

  const restore = async (s: Scooter) => {
    if (await action.run(() => api.post(`/admin/scooters/${s.id}/restore`))) list.reload();
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="eyebrow">Fleet management</span>
          <h1>Scooters</h1>
          <p className="muted">The fleet, its rates and status. Removed scooters keep their history and can be restored.</p>
        </div>
        <div className="admin-page__actions">
          <button className="primary" onClick={() => setEditing('new')}>
            Add scooter
          </button>
        </div>
      </div>
      {counts && (
        <dl className="header-stats" aria-label="Fleet summary">
          <div className="header-stat">
            <dt>In the fleet</dt>
            <dd>{counts.total}</dd>
          </div>
          <div className="header-stat">
            <dt>Available</dt>
            <dd>{counts.available}</dd>
          </div>
          <div className="header-stat">
            <dt>Rented</dt>
            <dd>{counts.rented}</dd>
          </div>
          <div className={`header-stat${counts.maintenance > 0 ? ' is-attention' : ''}`}>
            <dt>In workshop</dt>
            <dd>{counts.maintenance}</dd>
          </div>
          {counts.removed > 0 && (
            <div className="header-stat">
              <dt>Removed</dt>
              <dd>{counts.removed}</dd>
            </div>
          )}
        </dl>
      )}
      <ErrorAlert error={list.error ?? action.error} />
      {editing && (
        <ScooterForm
          scooter={editing === 'new' ? null : editing}
          onDone={() => {
            setEditing(null);
            list.reload();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      {list.loading && <Loading what="Loading scooters" />}
      {list.data?.length === 0 && <Empty>No scooters yet. Add the first one above.</Empty>}
      {list.data && list.data.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Scooter</th>
                <th scope="col">Plate</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  Per hour
                </th>
                <th scope="col" className="num">
                  Per km
                </th>
                <th scope="col" className="num">
                  Odometer
                </th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.id}>
                  <td data-label="Scooter">
                    <div className="fleet-cell">
                      <ScooterThumb imageUrl={s.imageUrl} alt={s.model} />
                      <div>
                        <strong>{s.code}</strong>
                        <span className="cell-sub">
                          {s.model}
                          {s.engineCc ? ` · ${s.engineCc} cc` : ''}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td data-label="Plate">{s.plateNumber}</td>
                  <td data-label="Status">
                    {s.deleted ? <span className="badge red">Removed</span> : <StatusBadge status={s.status} />}
                  </td>
                  <td data-label="Per hour" className="num">
                    {money(s.hourlyRate)}
                  </td>
                  <td data-label="Per km" className="num">
                    {money(s.perKmRate)}
                  </td>
                  <td data-label="Odometer" className="num">
                    {s.totalMileage.toLocaleString('en-LK', { maximumFractionDigits: 2 })} km
                  </td>
                  <td className="actions">
                    <div className="row">
                      <button className="small" onClick={() => setEditing(s)}>
                        Edit<span className="sr-only"> {s.code}</span>
                      </button>
                      {s.deleted ? (
                        <button className="small" disabled={action.busy} onClick={() => restore(s)}>
                          Restore<span className="sr-only"> {s.code}</span>
                        </button>
                      ) : (
                        s.status !== 'RENTED' && (
                          <>
                            <select
                              aria-label={`Set status of ${s.code}`}
                              value={s.status}
                              disabled={action.busy}
                              onChange={(e) => setStatus(s, e.target.value as ScooterStatus)}
                            >
                              <option value="AVAILABLE">Available</option>
                              <option value="MAINTENANCE">Maintenance</option>
                            </select>
                            <button className="small danger" disabled={action.busy} onClick={() => remove(s)}>
                              Remove<span className="sr-only"> {s.code}</span>
                            </button>
                          </>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ScooterForm({ scooter, onDone, onCancel }: { scooter: Scooter | null; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState(
    scooter
      ? {
          code: scooter.code,
          model: scooter.model,
          plateNumber: scooter.plateNumber,
          engineCc: String(scooter.engineCc ?? ''),
          hourlyRate: String(scooter.hourlyRate),
          perKmRate: String(scooter.perKmRate),
          totalMileage: String(scooter.totalMileage),
          imageUrl: scooter.imageUrl ?? '',
          description: scooter.description ?? '',
        }
      : EMPTY_SCOOTER,
  );
  const action = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    const body = {
      ...f,
      engineCc: f.engineCc ? Number(f.engineCc) : null,
      hourlyRate: Number(f.hourlyRate),
      perKmRate: Number(f.perKmRate),
      totalMileage: Number(f.totalMileage),
      imageUrl: f.imageUrl || null,
    };
    const res = await action.run(() =>
      scooter ? api.put(`/admin/scooters/${scooter.id}`, body) : api.post('/admin/scooters', body),
    );
    if (res) onDone();
  };

  return (
    <section className="panel-card admin-form" aria-labelledby="scooter-form-title">
      <div>
        <span className="eyebrow">{scooter ? 'Edit scooter' : 'Add new scooter'}</span>
        <h2 id="scooter-form-title">{scooter ? `Edit ${scooter.code}` : 'New scooter'}</h2>
      </div>
      <div className="scooter-editor">
        <div className="scooter-preview">
          {/* A preview of the Image URL below; photos are linked, not uploaded. */}
          <ScooterThumb imageUrl={f.imageUrl.trim() || null} alt={f.model ? `Photo of ${f.model}` : 'Scooter photo preview'} />
          <p className="muted small">
            {f.imageUrl.trim() ? 'Preview of the image URL.' : 'No photo yet: the site shows this scooter illustration.'}
          </p>
        </div>
        <div className="stack">
          <fieldset className="booking-fieldset">
            <legend>Scooter</legend>
            <div className="form-grid">
              <label>
                Fleet code
                <input value={f.code} onChange={set('code')} placeholder="SRK-07" />
              </label>
              <label>
                Model
                <input value={f.model} onChange={set('model')} />
              </label>
              <label>
                Plate number
                <input value={f.plateNumber} onChange={set('plateNumber')} />
              </label>
              <label>
                Engine (cc)
                <input type="number" value={f.engineCc} onChange={set('engineCc')} />
              </label>
            </div>
          </fieldset>
          <fieldset className="booking-fieldset">
            <legend>Rates &amp; odometer</legend>
            <div className="form-grid">
              <label>
                Hourly rate (LKR)
                <input type="number" min="0" step="0.01" value={f.hourlyRate} onChange={set('hourlyRate')} />
              </label>
              <label>
                Per-km rate (LKR)
                <input type="number" min="0" step="0.01" value={f.perKmRate} onChange={set('perKmRate')} />
              </label>
              <label>
                Total mileage (km)
                <input type="number" min="0" step="0.01" value={f.totalMileage} onChange={set('totalMileage')} />
              </label>
            </div>
          </fieldset>
          <fieldset className="booking-fieldset">
            <legend>Listing</legend>
            <div className="stack">
              <label>
                Image URL
                <input value={f.imageUrl} onChange={set('imageUrl')} aria-describedby="image-url-hint" />
                <span id="image-url-hint" className="field-hint">
                  Optional. A link to a photo of this scooter; photos are not uploaded here. Without one, the site shows a
                  scooter illustration.
                </span>
              </label>
              <label>
                Description
                <input value={f.description} onChange={set('description')} />
              </label>
            </div>
          </fieldset>
          <ErrorAlert error={action.error} />
          <div className="admin-form__actions">
            <button onClick={onCancel}>Cancel</button>
            <button className="primary" disabled={action.busy} onClick={submit}>
              {action.busy ? 'Saving…' : scooter ? 'Save changes' : 'Add scooter'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

const CATEGORIES: GearCategory[] = ['CAMPING', 'SAFETY', 'LUGGAGE', 'ACCESSORY'];

export function Gear() {
  const list = useLoad(() => api.get<GearItem[]>('/admin/gear'));
  const [editing, setEditing] = useState<GearItem | 'new' | null>(null);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="eyebrow">Rentals</span>
          <h1>Camping &amp; travel gear</h1>
          <p className="muted">Add-ons customers can choose when they book. Hidden items are not offered.</p>
        </div>
        <div className="admin-page__actions">
          <button className="primary" onClick={() => setEditing('new')}>
            Add item
          </button>
        </div>
      </div>
      <ErrorAlert error={list.error} />
      {editing && (
        <GearForm
          item={editing === 'new' ? null : editing}
          onDone={() => {
            setEditing(null);
            list.reload();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      {list.loading && <Loading what="Loading gear" />}
      {list.data?.length === 0 && <Empty>No gear items yet.</Empty>}
      {list.data && list.data.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Category</th>
                <th scope="col" className="num">
                  Per day
                </th>
                <th scope="col" className="num">
                  Stock
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((g) => (
                <tr key={g.id}>
                  <td data-label="Item">
                    {g.name}
                    <span className="cell-sub">{g.description}</span>
                  </td>
                  <td data-label="Category">{humanize(g.category)}</td>
                  <td data-label="Per day" className="num">
                    {money(g.dailyRate)}
                  </td>
                  <td data-label="Stock" className="num">
                    {g.totalQuantity}
                  </td>
                  <td data-label="Status">
                    {g.active ? <span className="badge green">Offered</span> : <span className="badge">Hidden</span>}
                  </td>
                  <td className="actions">
                    <div className="row">
                      <button className="small" onClick={() => setEditing(g)}>
                        Edit<span className="sr-only"> {g.name}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GearForm({ item, onDone, onCancel }: { item: GearItem | null; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    name: item?.name ?? '',
    category: item?.category ?? ('CAMPING' as GearCategory),
    description: item?.description ?? '',
    dailyRate: String(item?.dailyRate ?? ''),
    totalQuantity: String(item?.totalQuantity ?? '1'),
    active: item?.active ?? true,
  });
  const action = useAction();

  const submit = async () => {
    const body = { ...f, dailyRate: Number(f.dailyRate), totalQuantity: Number(f.totalQuantity) };
    const res = await action.run(() => (item ? api.put(`/admin/gear/${item.id}`, body) : api.post('/admin/gear', body)));
    if (res) onDone();
  };

  return (
    <section className="panel-card admin-form" aria-labelledby="gear-form-title">
      <h2 id="gear-form-title">{item ? `Edit ${item.name}` : 'New gear item'}</h2>
      <div className="form-grid">
        <label>
          Name
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label>
          Category
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as GearCategory })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {humanize(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Daily rate (LKR)
          <input type="number" value={f.dailyRate} onChange={(e) => setF({ ...f, dailyRate: e.target.value })} />
        </label>
        <label>
          Units in stock
          <input type="number" value={f.totalQuantity} onChange={(e) => setF({ ...f, totalQuantity: e.target.value })} />
        </label>
      </div>
      <label>
        Description
        <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </label>
      <label className="inline">
        <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
        Offer to customers
      </label>
      <ErrorAlert error={action.error} />
      <div className="admin-form__actions">
        <button className="primary" disabled={action.busy} onClick={submit}>
          {action.busy ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
