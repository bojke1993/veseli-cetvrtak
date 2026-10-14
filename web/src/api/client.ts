import type { ApiError as ApiErrorBody } from '@api';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const API_BASE = '/api';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function isErrorBody(x: unknown): x is ApiErrorBody {
  return typeof x === 'object' && x !== null && 'error' in x && typeof (x as ApiErrorBody).error?.message === 'string';
}

function fallbackMessage(status: number): string {
  if (status === 401) return 'Morate biti prijavljeni.';
  if (status === 403) return 'Nemate dozvolu za ovu akciju.';
  if (status === 404) return 'Nije pronađeno.';
  if (status >= 500) return 'Greška na serveru. Pokušajte ponovo.';
  return `Zahtev nije uspeo (${status}).`;
}

export async function request<T>(method: Method, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (method !== 'GET') headers['X-Requested-With'] = 'vc';

  let res: Response;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: payload, credentials: 'same-origin', signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Nema veze sa serverom.');
  }

  const text = res.status === 204 ? '' : await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }
  if (!res.ok) {
    if (isErrorBody(data)) throw new ApiError(res.status, data.error.code, data.error.message, data.error.details);
    throw new ApiError(res.status, 'http_' + res.status, fallbackMessage(res.status));
  }
  return data as T;
}

/** Builds "?a=1&b=x" skipping undefined / null / '' values. */
export function qs(params: object): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Došlo je do greške.';
}
