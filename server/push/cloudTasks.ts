import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import type { PushJob, PushScheduler } from './scheduler.ts';

// The Cloud Tasks side (ADR 044). A task is an HTTP POST to /api/push/fire at `job.at`, signed with an OIDC token for the invoker service
// account, so only Cloud Tasks (as that account) can call the route. The queue lives in the same project; the runtime account needs
// cloudtasks.enqueuer on it and iam.serviceAccountUser on the invoker.
export interface TasksConfig {
  /** projects/<project>/locations/<region>/queues/<queue> */
  queue: string;
  /** The full address of the fire route, also the token's audience. */
  fireUrl: string;
  /** The service account whose token signs each task. */
  invokerEmail: string;
}

export function tasksConfigFrom(env: Record<string, string | undefined>): { config: TasksConfig; reason?: undefined } | { config?: undefined; reason: string } {
  const queue = env.PUSH_QUEUE?.trim() ?? '';
  const base = env.BASE_URL?.trim() ?? '';
  const invokerEmail = env.PUSH_INVOKER_EMAIL?.trim() ?? '';
  if (!queue && !invokerEmail) return { reason: 'PUSH_QUEUE and PUSH_INVOKER_EMAIL are not set' };
  if (!/^projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/locations\/[a-z0-9-]+\/queues\/[A-Za-z0-9_-]+$/.test(queue)) return { reason: 'PUSH_QUEUE must look like projects/<project>/locations/<region>/queues/<queue>' };
  if (!/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(invokerEmail)) return { reason: 'PUSH_INVOKER_EMAIL must be a service account address' };
  if (!/^https:\/\/[^\s/]+$/.test(base)) return { reason: 'BASE_URL must be the service address (https) so the fire route can be named' };
  return { config: { queue, invokerEmail, fireUrl: `${base}/api/push/fire` } };
}

export const taskName = (job: PushJob) => `${job.subscriptionId}-${job.kind}-${job.key}-${job.at}`;

type Request = (url: string, body: unknown) => Promise<{ status: number }>;

/** `request` is the authenticated POST; tests pass a fake. */
export function cloudTasksScheduler(config: TasksConfig, request: Request = googleRequest()): PushScheduler {
  return {
    async schedule(job) {
      const payload = { subscriptionId: job.subscriptionId, kind: job.kind, key: job.key, at: job.at, body: job.body };
      const { status } = await request(`https://cloudtasks.googleapis.com/v2/${config.queue}/tasks`, {
        task: {
          name: `${config.queue}/tasks/${taskName(job)}`,
          scheduleTime: new Date(job.at).toISOString(),
          httpRequest: {
            httpMethod: 'POST',
            url: config.fireUrl,
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.from(JSON.stringify(payload)).toString('base64'),
            oidcToken: { serviceAccountEmail: config.invokerEmail, audience: config.fireUrl },
          },
        },
      });
      // 409: the same task is already queued (the phone sent the same schedule twice). That is the job done.
      if (status !== 409 && (status < 200 || status >= 300)) throw new Error(`cloud tasks answered ${status}`);
    },
  };
}

// The runtime account's own credentials (Application Default Credentials on Cloud Run).
function googleRequest(): Request {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  return async (url, data) => {
    const client = await auth.getClient();
    const res = await client.request({ url, method: 'POST', data, validateStatus: () => true });
    return { status: res.status };
  };
}

/** Checks the bearer token of a fire call: signed by Google, for this audience, from the invoker account with a verified address. */
export function oidcVerifier(config: TasksConfig, client = new OAuth2Client()): (token: string) => Promise<boolean> {
  return async token => {
    const ticket = await client.verifyIdToken({ idToken: token, audience: config.fireUrl });
    const p = ticket.getPayload();
    return p?.email === config.invokerEmail && p.email_verified === true;
  };
}
