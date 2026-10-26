import { useCallback, useState } from 'react';
import { ConfirmDialog, type ConfirmOptions } from './components/ConfirmDialog';

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

/**
 * An accessible replacement for window.confirm(): `if (!(await confirm({...}))) return;` keeps the caller's
 * conditions and API calls exactly as they were. Render `dialog` once in the page.
 */
export function useConfirm() {
  const [request, setRequest] = useState<Request | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setRequest({ ...options, resolve })),
    [],
  );

  const settle = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  const dialog = request ? (
    <ConfirmDialog {...request} onCancel={() => settle(false)} onConfirm={() => settle(true)} />
  ) : null;
  return { confirm, dialog };
}
