// ─── Token helpers ────────────────────────────────────────────────────────────

const TOKEN_KEY = 'srs.token';

/** A structured API error with optional per-field validation messages. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // private / incognito mode
  }
}

export function setToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Storage unavailable; session won't persist across page reloads
  }
}

// ─── Unauthorized handler (injected by AuthProvider) ────────────────────────

let onUnauthorized: () => void = () => {};

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // If the server responds with 401 and we had a token, the session expired
  if (res.status === 401 && token) {
    onUnauthorized();
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let fieldErrors: Record<string, string> | undefined;

    try {
      const data = await res.json();
      if (data?.message) message = data.message;
      fieldErrors = data?.fieldErrors ?? undefined;
      if (fieldErrors) {
        message +=
          ': ' +
          Object.entries(fieldErrors)
            .map(([k, v]) => `${k} ${v}`)
            .join(', ');
      }
    } catch {
      // Non-JSON error body — keep the default message
    }

    throw new ApiError(res.status, message, fieldErrors);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ─── Typed API object ────────────────────────────────────────────────────────

export const api = {
  get:    <T>(path: string)                  => request<T>('GET',    path),
  post:   <T>(path: string, body?: unknown)  => request<T>('POST',   path, body ?? {}),
  put:    <T>(path: string, body: unknown)   => request<T>('PUT',    path, body),
  patch:  <T>(path: string)                  => request<T>('PATCH',  path),
  delete: <T>(path: string)                  => request<T>('DELETE', path),
};

/** An ApiError from a failed response, with the server's message when it sent one. */
async function errorFrom(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const data = await res.json();
    if (data?.message) message = data.message;
  } catch {
    // Non-JSON error body — keep the default message
  }
  return new ApiError(res.status, message);
}

/** POSTs multipart form data (e.g. a repair report with photos); the browser sets the content type and boundary. */
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

/** Fetches an authenticated binary (e.g. a repair photo) as a Blob; such files are never public URLs. */
export async function getBlob(path: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) throw await errorFrom(res);
  return res.blob();
}

/** Downloads an authenticated file (e.g. CSV export). */
export async function download(path: string, filename: string) {
  const token = getToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

