import { type ReactNode, useEffect, useId, useRef } from 'react';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive actions (cancel, remove, block) get the danger treatment. */
  destructive?: boolean;
}

/**
 * A modal <dialog> (showModal: focus moves in, the page behind is inert, Escape cancels). Focus starts on Cancel,
 * the safe choice, and returns to the element that opened it. The confirm button answers once, so a double click
 * cannot run the action twice.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const answered = useRef(false);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      trigger?.focus();
    };
  }, []);

  const answer = (ok: boolean) => {
    if (answered.current) return;
    answered.current = true;
    if (ok) onConfirm();
    else onCancel();
  };

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={(e) => {
        // Escape: answer "no" through React state rather than letting the browser close it on its own.
        e.preventDefault();
        answer(false);
      }}
    >
      <h2 id={titleId} className="confirm-dialog__title">
        {title}
      </h2>
      <div id={messageId} className="confirm-dialog__message">
        {message}
      </div>
      <div className="confirm-dialog__actions">
        <button type="button" autoFocus onClick={() => answer(false)}>
          {cancelLabel}
        </button>
        <button type="button" className={destructive ? 'danger' : 'primary'} onClick={() => answer(true)}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
