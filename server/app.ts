import express from 'express';

// The app is built here and listened on in index.ts, so tests can start it on a free port.
export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}
