import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useBarcodeCamera } from './useBarcodeCamera.js';

// The camera, the reader and the polling are effects that need a browser (the food and supplement scan specs cover them with a stubbed camera); this checks what the first render says.
function Probe() {
  const cam = useBarcodeCamera(() => {}, true);
  return createElement('p', null, `${cam.camera}|${cam.error ?? 'none'}`);
}

describe('useBarcodeCamera', () => {
  it('starts with the camera starting and no error, before any effect has run', () => {
    expect(renderToString(createElement(Probe))).toContain('starting|none');
  });
});
