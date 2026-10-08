import { useEffect, useState } from 'react';
import { exInfo } from '../lib/data.js';
import { forgetSession } from '../lib/gate.js';
import { LS } from '../lib/storage.js';
import { ymd } from '../shared/dates.js';
import { deviceDataFile, versionLabel } from '../sync/labels.js';
import { useGoogleSignIn } from '../sync/useGoogleSignIn.js';
import { flag, getSyncApi, useAppStore } from '../store/useAppStore.js';
import ArmedButton from './ArmedButton.js';

// Shown when someone else signs in on a device that holds another account's data (B2e). Nothing is sent or received until
// the user chooses: keep a copy and wipe, or sign out again. Wiping is the only way on, and it takes a second press.
export default function OtherAccountCard() {
  const blocked = useAppStore(s => s.sync?.state === 'paused' && s.sync.pausedBecause === 'account');
  const dl = useAppStore(s => s.dl);
  const cfg = useAppStore(s => s.cfg);
  const { client, busy, setBusy } = useGoogleSignIn();
  const [email, setEmail] = useState<string | null>(null);
  const api = getSyncApi();

  useEffect(() => {
    if (!blocked) return;
    let current = true;
    void client.me().then(s => { if (current && s.status === 'signed-in') setEmail(s.email); });
    return () => { current = false; };
  }, [blocked, client]);

  if (!blocked || !api) return null;
  const who = email ?? 'the account you just signed in to';

  const download = () => {
    const nameOf = (id: string) => exInfo(cfg, id).n || id;
    void dl?.save({ filename: `iron-log-this-device-${ymd(new Date())}.json`, data: deviceDataFile(api.deviceData(), api.quarantined(), nameOf, versionLabel(__APP_VERSION__)) });
  };
  const wipe = async () => {
    setBusy(true);
    const out = await api.wipeForNewAccount();
    if (out === 'done') { window.location.reload(); return; } // the app still holds the old data in memory; start clean
    setBusy(false);
    flag('Could not check who is signed in. Nothing was wiped.');
  };
  const signOut = async () => {
    setBusy(true);
    const done = await client.signOut();
    setBusy(false);
    if (!done) { flag('Could not sign out. Try again in a moment.'); return; }
    forgetSession(LS);
    window.location.reload(); // signed out on purpose: the next screen is the landing page
  };

  return (
    <div className="notice movewarn" role="alert">
      <div>
        <b>This device holds data from another account.</b> You are signed in as {who}. Nothing has been sent or received, so the two accounts are not mixed.
        Keep a copy first if you want one, then either wipe this device and carry on as {who}, or sign out.
      </div>
      <div className="actions">
        {dl && <button type="button" className="btn sm" disabled={busy} onClick={download}>Download this device’s data</button>}
        <ArmedButton className="btn sm danger" label="Wipe it and continue" armedLabel="Tap again to wipe this device" onConfirm={() => void wipe()} />
        <button type="button" className="btn sm" disabled={busy} onClick={() => void signOut()}>Sign out</button>
      </div>
    </div>
  );
}
