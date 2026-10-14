// What the push routes need from the thing that sends later. The real one (Cloud Tasks) and the test fake both fit this.
export const PUSH_KINDS = ['rest', 'day-nudge'] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

export interface PushJob {
  /** The subscription row this device registered; only that device is notified. */
  subscriptionId: string;
  kind: PushKind;
  /** Names this schedule: a rest timer's start time. A cancel with another key leaves the job alone, so a late cancel cannot hit a newer timer. */
  key: string;
  /** When to send, ms since the epoch. */
  at: number;
  body: string;
}

/**
 * Makes `POST /api/push/fire` run with the job at `job.at`. It never takes a job back: whether a send is still wanted is the
 * subscription's `pending` marker (migration 019), which the routes set and clear and the fire route checks, so a cancelled or
 * replaced task fires and sends nothing.
 */
export interface PushScheduler {
  schedule(job: PushJob): Promise<void>;
}
