/**
 * Shown on the sign-in page when the app signed out because the server refused the session (401), for example after
 * the local backend restarted with a new signing key: whatever was being saved at that moment was not saved. Kept free
 * of runtime imports so `npm test` can run it.
 */
export const SESSION_ENDED_MESSAGE =
  'Your sign-in has ended (for example, the server was restarted). Anything you were saving was not saved: sign in again, then repeat it.';
