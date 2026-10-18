// The four states of a production issue (ADR 013 amendment), in the order the Issues screen shows them. The one list for the phone and the
// server; the database's check constraint and its admin functions name the same four (migrations 20261018000001 and 20261018000002).
export const ISSUE_STATUSES = ['open', 'investigating', 'fixed', 'ignored'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
