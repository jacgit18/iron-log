import { describe, expect, it } from 'vitest';
import { cloudTasksScheduler, oidcVerifier, taskName, tasksConfigFrom, type TasksConfig } from './cloudTasks.ts';

const QUEUE = 'projects/iron-log-prod/locations/us-central1/queues/push';
const env = { PUSH_QUEUE: QUEUE, PUSH_INVOKER_EMAIL: 'push-invoker@iron-log-prod.iam.gserviceaccount.com', BASE_URL: 'https://iron-log-123.us-central1.run.app' };
const config: TasksConfig = { queue: QUEUE, invokerEmail: env.PUSH_INVOKER_EMAIL, fireUrl: `${env.BASE_URL}/api/push/fire` };
const job = { subscriptionId: '42', kind: 'rest' as const, key: 'k1', at: 1_800_000_090_000, body: 'Rest over.' };

describe('tasksConfigFrom', () => {
  it('is off, with a reason, when nothing is set', () => {
    expect(tasksConfigFrom({}).reason).toMatch(/not set/);
  });
  it('names the fire route from BASE_URL', () => {
    expect(tasksConfigFrom(env).config).toEqual(config);
  });
  it('says which setting is wrong', () => {
    expect(tasksConfigFrom({ ...env, PUSH_QUEUE: 'push' }).reason).toMatch(/PUSH_QUEUE/);
    expect(tasksConfigFrom({ ...env, PUSH_INVOKER_EMAIL: 'me@gmail.com' }).reason).toMatch(/service account/);
    expect(tasksConfigFrom({ ...env, BASE_URL: 'http://localhost:3001' }).reason).toMatch(/BASE_URL/);
    expect(tasksConfigFrom({ ...env, BASE_URL: undefined }).reason).toMatch(/BASE_URL/);
  });
});

describe('cloudTasksScheduler', () => {
  it('creates one task: named for the job, at its time, a POST to the fire route signed for the invoker', async () => {
    const calls: { url: string; body: unknown }[] = [];
    await cloudTasksScheduler(config, async (url, body) => { calls.push({ url, body }); return { status: 200 }; }).schedule(job);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`https://cloudtasks.googleapis.com/v2/${QUEUE}/tasks`);
    const task = (calls[0]!.body as { task: { name: string; scheduleTime: string; httpRequest: { body: string } & Record<string, unknown> } }).task;
    expect(task.name).toBe(`${QUEUE}/tasks/42-rest-k1-1800000090000`);
    expect(task.scheduleTime).toBe(new Date(job.at).toISOString());
    expect(task.httpRequest).toMatchObject({ httpMethod: 'POST', url: config.fireUrl, oidcToken: { serviceAccountEmail: config.invokerEmail, audience: config.fireUrl } });
    expect(JSON.parse(Buffer.from(task.httpRequest.body, 'base64').toString())).toEqual({ subscriptionId: '42', kind: 'rest', key: 'k1', at: job.at, body: 'Rest over.' });
  });
  it('carries a water reminder\'s repeat in the task body, and nothing extra for a job without one', async () => {
    const bodies: unknown[] = [];
    const sched = cloudTasksScheduler(config, async (_url, body) => { bodies.push(body); return { status: 200 }; });
    const repeat = { everyMs: 7_200_000, until: job.at + 36_000_000 };
    await sched.schedule({ ...job, kind: 'water', key: 'w1', repeat });
    await sched.schedule(job);
    const payload = (b: unknown) => JSON.parse(Buffer.from((b as { task: { httpRequest: { body: string } } }).task.httpRequest.body, 'base64').toString());
    expect(payload(bodies[0]).repeat).toEqual(repeat);
    expect(payload(bodies[1])).not.toHaveProperty('repeat');
  });
  it('treats an already-queued task (409) as done and any other failure as an error', async () => {
    await expect(cloudTasksScheduler(config, async () => ({ status: 409 })).schedule(job)).resolves.toBeUndefined();
    await expect(cloudTasksScheduler(config, async () => ({ status: 403 })).schedule(job)).rejects.toThrow(/403/);
    await expect(cloudTasksScheduler(config, async () => ({ status: 500 })).schedule(job)).rejects.toThrow(/500/);
  });
  it('a task name only uses the characters Cloud Tasks allows', () => {
    expect(taskName(job)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('oidcVerifier', () => {
  const clientFor = (payload: object | undefined, seen: { audience?: unknown } = {}) => ({
    verifyIdToken: async (opts: { audience?: unknown }) => { seen.audience = opts.audience; if (!payload) throw new Error('invalid signature'); return { getPayload: () => payload }; },
  }) as never;
  it('accepts the invoker with a verified address, checked against the fire URL as audience', async () => {
    const seen: { audience?: unknown } = {};
    expect(await oidcVerifier(config, clientFor({ email: config.invokerEmail, email_verified: true }, seen))('t')).toBe(true);
    expect(seen.audience).toBe(config.fireUrl);
  });
  it('refuses another account, an unverified address, and a token Google would not verify', async () => {
    expect(await oidcVerifier(config, clientFor({ email: 'other@x.iam.gserviceaccount.com', email_verified: true }))('t')).toBe(false);
    expect(await oidcVerifier(config, clientFor({ email: config.invokerEmail, email_verified: false }))('t')).toBe(false);
    await expect(oidcVerifier(config, clientFor(undefined))('t')).rejects.toThrow(); // the fire route turns a throw into 401
  });
});
