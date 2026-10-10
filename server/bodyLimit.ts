import type { RequestHandler } from 'express';

// Better Auth reads its whole request body into memory before it looks at it, and its routes come before every body parser, so
// without this an anonymous caller could post a body of any size to /api/auth. The audit of 2026-10 found that 16 concurrent
// 32 MiB bodies killed a 512 MiB server. Every legitimate auth call is a few hundred bytes.
//
// The size is judged from the Content-Length header, before a byte is read, and nothing is wrapped around the stream (listening
// for its data here would start it flowing before Better Auth is ready for it). A body without a length (chunked) cannot be
// judged that way, so it is refused too: no browser sends one for these calls.
export const AUTH_BODY_MAX = 16 * 1024;

export function bodyLimit(maxBytes: number = AUTH_BODY_MAX): RequestHandler {
  return (req, res, next) => {
    const declared = req.headers['content-length'];
    const chunked = req.headers['transfer-encoding'] !== undefined;
    if (chunked || (declared !== undefined && !(Number(declared) <= maxBytes))) {
      res.set('Connection', 'close');
      res.status(413).json({ ok: false, error: { code: 'too-large', message: 'request body too large' } });
      return;
    }
    next();
  };
}
