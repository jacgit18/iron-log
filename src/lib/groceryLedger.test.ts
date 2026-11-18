import { describe, expect, it } from 'vitest';
import type { GroceryMonth } from '../types.ts';
import { addReceiptMoney, duplicateOf, freshKey, mergeLedger, mergeMoney, receiptCount, receiptKey, receiptsText, removeReceiptMoney } from './groceryLedger.js';

const month = (m: Partial<GroceryMonth> = {}): GroceryMonth => ({ lines: {}, pulled: [], ...m });
const A = receiptKey("BJ's", '2026-11-03', 5679, 679), B = receiptKey("BJ's", '2026-11-20', 5352, 352);

describe('adding receipts to a month', () => {
  it('adds the second receipt of a store to the first instead of replacing it (the bug)', () => {
    const m = month();
    expect(addReceiptMoney(m, A, "BJ's", 679, 1727)).toBe(true);
    expect(addReceiptMoney(m, B, "BJ's", 352, 100)).toBe(true);
    expect(m.tax).toEqual({ "BJ's": 1031 });
    expect(m.credit).toEqual({ "BJ's": 1827 });
    expect(receiptCount(m, "BJ's", 'tax')).toBe(2);
    expect(receiptCount(m, "BJ's", 'credit')).toBe(2);
    expect(receiptsText(1)).toBe('From 1 receipt');
  });
  it('adds to a total that was typed by hand, keeps other stores apart, and ignores a key already filed', () => {
    const m = month({ tax: { "BJ's": 1000, Aldi: 50 } });
    addReceiptMoney(m, A, "BJ's", 679, 0);
    expect(m.tax).toEqual({ "BJ's": 1679, Aldi: 50 });
    expect(m.credit).toBeUndefined();
    expect(addReceiptMoney(m, A, "BJ's", 679, 0)).toBe(false);
    expect(m.tax).toEqual({ "BJ's": 1679, Aldi: 50 });
    expect(addReceiptMoney(m, B, '', 5, 5)).toBe(false);
    expect(addReceiptMoney(m, B, "BJ's", 0, 0)).toBe(false);
  });
  it('spots a repeat of a receipt and files an on-purpose second copy under its own key', () => {
    const m = month(); addReceiptMoney(m, A, "BJ's", 679, 0);
    expect(duplicateOf(m.rcpts, A)).toBe(A);
    expect(duplicateOf(m.rcpts, B)).toBeNull();
    expect(duplicateOf(undefined, A)).toBeNull();
    expect(freshKey(m.rcpts, A)).toBe(`${A}#2`);
    addReceiptMoney(m, freshKey(m.rcpts, A), "BJ's", 679, 0);
    expect(duplicateOf(m.rcpts, A)).toBe(A);
    expect(freshKey(m.rcpts, A)).toBe(`${A}#3`);
    expect(m.tax).toEqual({ "BJ's": 1358 });
  });
});

describe('Undo of one receipt', () => {
  it('takes back exactly that receipt, and the receipt can be applied again', () => {
    const m = month(); addReceiptMoney(m, A, "BJ's", 679, 1727); addReceiptMoney(m, B, "BJ's", 352, 0);
    expect(removeReceiptMoney(m, B)).toBe(true);
    expect(m.tax).toEqual({ "BJ's": 679 });
    expect(m.credit).toEqual({ "BJ's": 1727 });
    expect(removeReceiptMoney(m, B)).toBe(false); // twice is nothing
    expect(addReceiptMoney(m, B, "BJ's", 352, 0)).toBe(true);
    expect(m.tax).toEqual({ "BJ's": 1031 });
  });
  it('keeps a hand-typed total as the base, and never goes below none', () => {
    const m = month(); addReceiptMoney(m, A, "BJ's", 679, 0);
    m.tax = { "BJ's": 2000 }; // typed in the box after Apply
    removeReceiptMoney(m, A);
    expect(m.tax).toEqual({ "BJ's": 1321 });
    const n = month(); addReceiptMoney(n, A, "BJ's", 679, 100);
    n.tax = { "BJ's": 300 }; delete n.credit;
    removeReceiptMoney(n, A);
    expect(n.tax).toBeUndefined(); expect(n.credit).toBeUndefined(); expect(n.rcpts).toBeUndefined();
  });
});

describe('merging two devices', () => {
  const base = month(); addReceiptMoney(base, A, "BJ's", 679, 1727);
  const withB = (m: GroceryMonth, k = B, tax = 352, credit = 0) => { const c = structuredClone(m); addReceiptMoney(c, k, "BJ's", tax, credit); return c; };
  it('keeps both receipts when each device added a different one offline', () => {
    const ours = withB(base), theirs = withB(base, receiptKey("BJ's", '2026-11-25', 4100, 210), 210);
    expect(mergeMoney('tax', base, ours, theirs)).toEqual({ "BJ's": 679 + 352 + 210 });
    expect(Object.keys(mergeLedger(base, ours, theirs))).toHaveLength(3);
  });
  it('counts a receipt applied on both devices once', () => {
    expect(mergeMoney('tax', base, withB(base), withB(base))).toEqual({ "BJ's": 1031 });
  });
  it('a receipt undone on one device and one added on the other both count', () => {
    const ours = structuredClone(base); removeReceiptMoney(ours, A);
    const theirs = withB(base);
    expect(mergeMoney('tax', base, ours, theirs)).toEqual({ "BJ's": 352 });
  });
  it('a typed value still beats a receipt: this device wins the conflict', () => {
    const typed = structuredClone(base); typed.tax = { "BJ's": 5 };
    expect(mergeMoney('tax', base, typed, withB(base))).toEqual({ "BJ's": 5 });
    expect(mergeMoney('tax', base, withB(base), typed)).toEqual({ "BJ's": 1031 });
  });
  it('one side unchanged takes the other, and no base means this device over the other', () => {
    expect(mergeMoney('tax', base, base, withB(base))).toEqual({ "BJ's": 1031 });
    expect(mergeMoney('tax', null, month({ tax: { X: 1 } }), month({ tax: { X: 2, Y: 3 } }))).toEqual({ X: 1, Y: 3 });
  });
});
