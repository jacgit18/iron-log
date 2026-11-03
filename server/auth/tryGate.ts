/* ---------- Sign-in tries with an emailed code: one at a time per address, wrong codes counted per address and network ----------
   Better Auth counts a code's wrong guesses with a read then a write, so parallel guesses are all checked before the count catches up
   (code audit S-01). Here the tries for one address run one after another, so that count cannot be raced, and only a WRONG code is counted,
   against the address and the sender's network together. A stranger on another network can no longer lock an address out (#407); the higher
   per-address ceiling stays as a backstop. State is per server instance, like perAddressLimit (ADR 042). */

/** The header the server sets from the connection (app.ts) with the client's network key; Better Auth's hooks read it. */
export const NETWORK_HEADER = 'x-lb-network';

export interface TryGateOptions {
  /** Wrong codes allowed for one address from one network in `windowMs`. */
  perNetwork: number;
  /** Wrong codes allowed for one address from anywhere in `windowMs`. */
  perAddress: number;
  windowMs: number;
  /** A try that never reports back frees its turn after this long. */
  holdMs?: number;
  /** Tries waiting for one address; more are refused at once, so a flood cannot pile up in memory. */
  maxWaiting?: number;
  now?: () => number;
}

export interface TryGate {
  /** Waits for this address's turn. False: refused (too many wrong codes, or too many waiting). True: the caller must call `end`. */
  begin(email: string, network: string): Promise<boolean>;
  /** The try is over; `wrong` counts it against the address and network. Safe to call twice or without a turn (then nothing happens). */
  end(email: string, wrong: boolean): void;
}

export function createTryGate({ perNetwork, perAddress, windowMs, holdMs = 10_000, maxWaiting = 20, now = Date.now }: TryGateOptions): TryGate {
  const tails = new Map<string, Promise<void>>();
  const waiting = new Map<string, number>();
  const holders = new Map<string, { network: string; release: () => void }>();
  const wrongs = new Map<string, { network: string; at: number }[]>();
  let swept = 0;

  const recent = (email: string): { network: string; at: number }[] => {
    const t = now();
    const list = (wrongs.get(email) ?? []).filter(w => t - w.at < windowMs);
    if (list.length) wrongs.set(email, list);
    else wrongs.delete(email);
    return list;
  };

  return {
    async begin(email, network) {
      if ((waiting.get(email) ?? 0) >= maxWaiting) return false;
      waiting.set(email, (waiting.get(email) ?? 0) + 1);
      const prev = tails.get(email) ?? Promise.resolve();
      let release!: () => void;
      const mine = new Promise<void>(r => { release = r; });
      const tail = prev.then(() => mine);
      tails.set(email, tail);
      await prev;
      waiting.set(email, (waiting.get(email) ?? 1) - 1);
      if (waiting.get(email) === 0) waiting.delete(email);
      let freed = false;
      const free = () => {
        if (freed) return;
        freed = true;
        clearTimeout(timer);
        if (holders.get(email)?.release === free) holders.delete(email);
        release();
        if (tails.get(email) === tail) tails.delete(email);
      };
      const timer = setTimeout(free, holdMs);
      timer.unref();
      const list = recent(email);
      if (list.length >= perAddress || list.filter(w => w.network === network).length >= perNetwork) {
        free();
        return false;
      }
      holders.set(email, { network, release: free });
      return true;
    },
    end(email, wrong) {
      const holder = holders.get(email);
      if (!holder) return;
      if (wrong) {
        const t = now();
        wrongs.set(email, [...recent(email), { network: holder.network, at: t }]);
        // Drop addresses whose window has passed, once a second at most (a flood of made-up addresses must not make each request cost more).
        if (wrongs.size > 5000 && t - swept >= 1000) { swept = t; for (const k of [...wrongs.keys()]) recent(k); }
      }
      holder.release();
    },
  };
}
