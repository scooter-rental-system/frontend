import { MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

/**
 * A "Back" control for detail and workflow pages. It returns to the previous page in this app when there is one
 * (React Router keeps the history index in window.history.state.idx), otherwise it goes to {@code fallback}, so it never
 * leaves the site or lands on a page the user cannot open. It is a real link to the fallback, so it also works with
 * the keyboard, middle-click and without JavaScript history.
 */
export function BackLink({ fallback, label = 'Back' }: { fallback: string; label?: string }) {
  const navigate = useNavigate();

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      e.preventDefault();
      navigate(-1);
    }
  };

  return (
    <Link to={fallback} className="back-link" onClick={onClick}>
      <span aria-hidden>←</span> {label}
    </Link>
  );
}
