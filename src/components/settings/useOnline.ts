import { useEffect, useState } from 'react';

/** Whether the browser says it has a connection; billing buttons need one. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const set = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', set);
    window.addEventListener('offline', set);
    return () => { window.removeEventListener('online', set); window.removeEventListener('offline', set); };
  }, []);
  return online;
}
