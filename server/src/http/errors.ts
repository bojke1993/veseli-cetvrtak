/** Error with an HTTP status and a stable code; rendered as { error: { code, message } }. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Potrebna je prijava.') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'Nemate dozvolu za ovu akciju.') => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Nije pronađeno.') => new HttpError(404, 'not_found', message);
export const conflict = (message: string, details?: unknown) => new HttpError(409, 'conflict', message, details);
export const unprocessable = (message: string, details?: unknown) => new HttpError(422, 'unprocessable', message, details);
