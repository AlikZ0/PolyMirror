import { describe, expect, it } from 'vitest';
import { DEFAULT_COPY_SETTINGS, calculateCopyAmount } from '@polymirror/shared';
import { looksLikeSecret, toFormState, toSettings, validate } from './formModel';

describe('copy settings form model', () => {
  it('round-trips the default settings and validates them', () => {
    const form = toFormState(DEFAULT_COPY_SETTINGS);
    expect(toSettings(form)).toEqual(DEFAULT_COPY_SETTINGS);
    expect(validate(form).ok).toBe(true);
  });

  it('reports schema errors on the right fields', () => {
    const form = toFormState({ ...DEFAULT_COPY_SETTINGS, minCopyAmount: 50, maxPerTrade: 20 });
    const res = validate(form);
    expect(res.ok).toBe(false);
    expect(res.errors.minCopyAmount).toMatch(/must not exceed/);
    const slip = validate({
      ...form,
      numbers: { ...form.numbers, minCopyAmount: '1', maxSlippagePct: '90' },
    });
    expect(slip.errors.maxSlippagePct).toBeDefined();
  });

  it('rejects private keys and seed phrases in the wallet field', () => {
    expect(looksLikeSecret('0x' + 'ab'.repeat(32))).toBe(true);
    expect(looksLikeSecret('abandon '.repeat(12).trim())).toBe(true);
    expect(looksLikeSecret('0x1111111111111111111111111111111111111111')).toBe(false);
    const form = toFormState(DEFAULT_COPY_SETTINGS);
    const res = validate({ ...form, walletAddress: 'ab'.repeat(32) });
    expect(res.ok).toBe(false);
    expect(res.errors.walletAddress).toMatch(/private key or seed phrase/);
  });

  it('forces confirmation in manual mode', () => {
    const form = toFormState({
      ...DEFAULT_COPY_SETTINGS,
      mode: 'AUTOMATIC',
      confirmationRequired: false,
    });
    expect(toSettings(form).confirmationRequired).toBe(false);
    expect(toSettings({ ...form, mode: 'MANUAL' }).confirmationRequired).toBe(true);
  });

  it('preview amount comes only from the user settings', () => {
    const s = toSettings(toFormState(DEFAULT_COPY_SETTINGS));
    expect(calculateCopyAmount(s, 100_000).amount).toBe(10);
    expect(
      calculateCopyAmount({ ...s, sizingMode: 'PERCENTAGE', percentage: 1 }, 100_000).amount,
    ).toBe(20);
  });
});
