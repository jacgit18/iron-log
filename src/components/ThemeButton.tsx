import { useState } from 'react';
import { getAppearance, nextTheme, setAppearance, themeButtonLabel, type Theme } from '../lib/appearance.js';
import Icon, { type IconName } from './Icon.js';
import './ThemeButton.css';

// The colours button at the top of every screen, beside Help. One tap steps match device, light, dark (the old Appearance panel's radios).
// The icon shows the choice now in force. It replaces the panel in Settings, so the choice is one tap away on a phone too.
const ICON: Record<Theme, IconName> = { system: 'contrast', light: 'sun', dark: 'moon' };

export default function ThemeButton() {
  const [theme, setTheme] = useState<Theme>(() => getAppearance().theme);
  const label = themeButtonLabel(theme);
  return (
    <button type="button" className="btn ghost themebtn" id="theme-btn" aria-label={label} title={label}
      onClick={() => setTheme(setAppearance({ theme: nextTheme(theme) }).theme)}>
      <Icon name={ICON[theme]} />
    </button>
  );
}
