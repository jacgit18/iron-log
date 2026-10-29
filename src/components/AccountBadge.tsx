import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { flag, useAppStore } from '../store/useAppStore.js';
import Icon from './Icon.js';
import { motionOK } from '../lib/motion.js';
import { forgetSession } from '../lib/gate.js';
import { disablePush } from '../lib/pushClient.js';
import { signOutFlow } from '../lib/signOutFlow.js';
import { closeSettingsScreen } from '../lib/settingsScreens.js';
import { GROUPS, findVisible, jumpToGroup } from '../lib/settingsGroups.js';
import { LS } from '../lib/storage.js';
import { createAccountClient } from '../sync/account.js';
import { signIn as devHeaders } from '../sync/devUser.js';
import './AccountBadge.css';

// Who is signed in, at the right end of the header: a round initial with a green dot, and the name beside it where there is room. It
// opens Settings, where the Account panel has the sign-out. Shown only when syncing is on and the server says someone is signed in:
// "could not check" and "signed out" show nothing here (the sign-in card and the Account panel already say those), so the badge never
// claims an account that is not there. The state is a word for a screen reader and a dot for the eye, never the colour alone.
// Beside it a chevron opens the account menu: a dropdown under the badge, a bottom sheet on a phone (CSS only; one set of markup). Each row
// opens Settings at that group, so Settings itself needs no row of jump pills here. The badge keeps its own job (open Settings), and the
// menu is a separate button, so the badge's id and name stay what the rest of the app and its tests use.
// The initial is drawn by CSS from data-initial, so the button's visible text is the name alone and the accessible name contains it (axe label-content-name-mismatch).
// `email` is shown under the name when it adds something; `canSignOut` is false for the development user, who has no real session to end.
export default function AccountBadge({ name, email = null, canSignOut = false }: { name: string | null; email?: string | null; canSignOut?: boolean }) {
  const tab = useAppStore(s => s.tab);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [busy, setBusy] = useState(false);
  const account = useMemo(() => createAccountClient({ headers: devHeaders }), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    const onDown = (e: Event) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open]);
  if (name === null) return null;
  const initial = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
  const go = (id: string) => {
    setOpen(false);
    useAppStore.getState().setTab('settings');
    closeSettingsScreen(); // a Training screen may be open on Settings
    void jumpToGroup(id, { find: findVisible, raf: requestAnimationFrame, smooth: motionOK() });
  };
  const signOut = async () => {
    setBusy(true);
    const ok = await signOutFlow({ disablePush, signOut: () => account.signOut(), forgetSession: () => forgetSession(LS), forgetBackups: () => useAppStore.getState().forgetBackups(), reload: () => window.location.reload(), tell: flag });
    if (!ok) setBusy(false);
  };
  return (
    <div className="acctwrap" ref={wrap}>
      <button type="button" className="acctbadge" id="account-badge" aria-label={`Signed in as ${name}. Open account settings`} title={`Signed in as ${name}`} aria-current={tab === 'settings' ? 'page' : undefined}
        onClick={() => useAppStore.getState().setTab('settings')}>
        <span className="acctavatar" aria-hidden="true" data-initial={initial}><i className="acctdot" /></span>
        <span className="acctname" aria-hidden="true">{name}</span>
      </button>
      <button type="button" className="acctchev" id="account-menu-btn" ref={btn} aria-label="Account menu" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(o => !o)}>
        <Icon name="chevron-down" />
      </button>
      {open && <div className="acctscrim" aria-hidden="true" onClick={() => setOpen(false)} />}
      {open && (
        <div className="acctmenu" id={menuId} role="group" aria-label="Account menu">
          <div className="acctgrab" aria-hidden="true" />
          <p className="acctwho"><b>{name}</b>{email && email !== name ? email : 'Signed in'}</p>
          <p className="acctlbl">Settings</p>
          {GROUPS.map(([id, label]) => (
            <button key={id} type="button" className={`acctitem${id === 'erase' ? ' danger' : ''}`} onClick={() => go(id)}>{label}</button>
          ))}
          {canSignOut && (
            <>
              <div className="acctsep" aria-hidden="true" />
              <button type="button" className="acctitem" disabled={busy} onClick={() => void signOut()}>Sign out</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
