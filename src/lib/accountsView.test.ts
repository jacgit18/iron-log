import { describe, expect, it } from 'vitest';
import { actionText, capPercent, capText, deleteConfirmMatches, joinedText, planText } from './accountsView.js';

describe('accountsView', () => {
  it('writes the cap', () => {
    expect(capText(7, 25)).toBe('7 of 25 accounts');
    expect(capText(25, 25)).toBe('25 of 25 accounts (full)');
    expect(capText(1, null)).toBe('1 account, no cap set');
    expect(capText(30, null)).toBe('30 accounts, no cap set');
  });
  it('fills the bar from 0 to 100', () => {
    expect(capPercent(5, 20)).toBe(25);
    expect(capPercent(40, 25)).toBe(100);
    expect(capPercent(5, null)).toBe(0);
    expect(capPercent(5, 0)).toBe(0);
  });
  it('names plans', () => {
    expect(['free', 'beta', 'paid', 'lifetime', 'founder', ''].map(planText)).toEqual(['Free', 'Beta', 'Paid', 'Lifetime', 'Founder', 'Unknown']);
  });
  it('writes the join date in UTC', () => {
    expect(joinedText('2026-09-14T23:30:00Z')).toBe('Joined 14 Sep 2026');
    expect(joinedText('nonsense')).toBe('Joined unknown');
  });
  it('writes a log line, also for an account that is gone', () => {
    expect(actionText({ action: 'suspend', targetId: '15' })).toBe('Suspended account 15');
    expect(actionText({ action: 'restore', targetId: null })).toBe('Restored an account that was deleted');
  });
  it('writes the delete line without a number, and matches the typed number exactly', () => {
    expect(actionText({ action: 'delete', targetId: null })).toBe('Deleted an account');
    expect(deleteConfirmMatches('15', '15')).toBe(true);
    expect(deleteConfirmMatches(' 15 ', '15')).toBe(true);
    for (const typed of ['', '1', '150', '015', 'fifteen', '15x']) expect(deleteConfirmMatches(typed, '15')).toBe(false);
  });
});
