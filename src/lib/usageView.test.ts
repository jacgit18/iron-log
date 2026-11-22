import { describe, expect, it } from 'vitest';
import { featureTable, returnRate } from './usageView.js';

describe('returnRate', () => {
  it('rounds to a whole percent and says n/a when nobody was eligible', () => {
    expect(returnRate({ after: 1, eligible: 3, returned: 1 })).toBe('33%');
    expect(returnRate({ after: 7, eligible: 0, returned: 0 })).toBe('n/a');
  });
});

describe('featureTable', () => {
  const features = [
    { version: '11', event: 'workout_logged', total: 4 },
    { version: '12', event: 'app_open', total: 9 },
    { version: '11', event: 'app_open', total: 2 },
  ];
  it('sorts events, puts the newest version first and gives 0 for an empty cell', () => {
    const t = featureTable(features);
    expect(t.events).toEqual(['app_open', 'workout_logged']);
    expect(t.versions).toEqual(['12', '11']);
    expect(t.total('11', 'app_open')).toBe(2);
    expect(t.total('12', 'workout_logged')).toBe(0);
  });
  it('is empty for no features', () => {
    expect(featureTable([]).events).toEqual([]);
  });
});
