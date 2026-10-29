import { useEffect, useState } from 'react';
import { getBlob } from '../api';

/**
 * An image only signed-in users may see (the QR code, a payment receipt): fetched with the user's token and shown
 * from a local object URL, never a public link. A click opens it full size in a new tab.
 */
export function AuthImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let live = true;
    setUrl(null);
    setFailed(false);
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

  if (failed) return <span className="auth-image__missing small">{alt}: could not be loaded</span>;
  if (!url) return <span className="auth-image__loading small" aria-label={`${alt}, loading`} />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={`Open ${alt.toLowerCase()} full size`}>
      <img src={url} alt={alt} className={className} />
    </a>
  );
}
