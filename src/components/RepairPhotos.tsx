import { useEffect, useState } from 'react';
import { getBlob } from '../api';
import { NO_PHOTOS, repairPhotoPath } from '../repairs';
import type { RepairPhoto } from '../types';

/**
 * The photos of one repair report. Each is fetched with the signed-in user's token (the backend allows only the
 * booking's customer and admins) and shown from a local object URL; a click opens it full size in a new tab.
 */
export function RepairPhotos({
  reportId,
  photos,
  showEmpty = false,
}: {
  reportId: string;
  photos: RepairPhoto[];
  showEmpty?: boolean;
}) {
  if (photos.length === 0) {
    return showEmpty ? <p className="muted small">{NO_PHOTOS}</p> : null;
  }
  return (
    <ul className="repair-photos" aria-label="Photos">
      {photos.map((p, i) => (
        <li key={p.id}>
          <PhotoThumb path={repairPhotoPath(reportId, p.id)} label={`Photo ${i + 1} of ${photos.length}`} />
        </li>
      ))}
    </ul>
  );
}

function PhotoThumb({ path, label }: { path: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let live = true;
    getBlob(path)
      .then((blob) => {
        if (!live) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (failed) return <span className="repair-photos__missing small">{label}: could not be loaded</span>;
  if (!url) return <span className="repair-photos__loading small" aria-label={`${label}, loading`} />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={`Open ${label.toLowerCase()} full size`}>
      <img src={url} alt={label} />
    </a>
  );
}
