// What the push routes need from the thing that sends later. The real one (Cloud Tasks, PR 4) and the test fake both fit this.
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

export interface PushScheduler {
  /** Replaces any pending job of the same subscription and kind. */
  schedule(job: PushJob): Promise<void>;
  /** Removes the pending job of that subscription and kind, when `key` matches it (or no key is given). */
  cancel(job: { subscriptionId: string; kind: PushKind; key?: string }): Promise<void>;
}
