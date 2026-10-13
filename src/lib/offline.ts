/* ---------- What the offline notice says ----------
   Pure, so it can be tested without a browser. Only meaningful with syncing on: with syncing off everything is already local. */

export type OfflineView = 'hidden' | 'offline' | 'reconnecting';

/** `wasOffline`: the device went offline since the last time nothing was waiting, so a return to the network is worth a word
 *  while changes made meanwhile are still being sent. `pending`: documents written here that the server does not have yet. */
export function offlineView({ syncOn, online, wasOffline, pending }: { syncOn: boolean; online: boolean; wasOffline: boolean; pending: number }): OfflineView {
  if (!syncOn) return 'hidden';
  if (!online) return 'offline';
  return wasOffline && pending > 0 ? 'reconnecting' : 'hidden';
}
