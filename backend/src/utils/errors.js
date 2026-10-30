export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const forbidden = (msg = 'You do not have permission for this action', details) => new HttpError(403, msg, details);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const conflict = (msg, details) => new HttpError(409, msg, details);

export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
