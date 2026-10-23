import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';
import { autoDeviceName, cleanDeviceName, deviceName, renameDevice } from './deviceName.js';

beforeEach(clearStorage);

describe('autoDeviceName', () => {
  const ua = (userAgent: string, maxTouchPoints = 0) => autoDeviceName({ userAgent, maxTouchPoints });
  it('names the common devices from the browser', () => {
    expect(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')).toBe('iPhone');
    expect(ua('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)')).toBe('iPad');
    expect(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5)).toBe('iPad'); // an iPad asking for the desktop site
    expect(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0)).toBe('Mac');
    expect(ua('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36')).toBe('Android phone');
    expect(ua('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/126 Safari/537.36')).toBe('Android tablet');
    expect(ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126')).toBe('Windows PC');
    expect(ua('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36')).toBe('Chromebook');
    expect(ua('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126')).toBe('Linux PC');
    expect(ua('')).toBe('This browser');
  });
});
describe('cleanDeviceName', () => {
  it('keeps 1 to 40 printable characters, trimmed', () => {
    expect(cleanDeviceName('  Josh’s phone ')).toBe('Josh’s phone');
    for (const bad of ['', '   ', 'x'.repeat(41), 'a\nb', 'a\u0007b']) expect(cleanDeviceName(bad)).toBeNull();
  });
});
describe('deviceName and renameDevice', () => {
  it('uses the browser name until the device is renamed, and goes back when the name is emptied', () => {
    const auto = deviceName();
    expect(renameDevice('Work laptop')).toBe(true);
    expect(deviceName()).toBe('Work laptop');
    expect(renameDevice('x'.repeat(41))).toBe(false);
    expect(deviceName()).toBe('Work laptop'); // a bad name changes nothing
    expect(renameDevice('  ')).toBe(true);
    expect(deviceName()).toBe(auto);
  });
});
