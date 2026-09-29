import { copySettingsInputSchema, type CopySettings } from '@polymirror/shared';

export type SettingsInput = Omit<CopySettings, 'updatedAt'>;

/** Numeric fields are edited as strings so partially typed values are not lost. */
export type NumericKey =
  | 'fixedAmount'
  | 'percentage'
  | 'minCopyAmount'
  | 'maxPerTrade'
  | 'maxDailyAmount'
  | 'maxOpenPositions'
  | 'minWhaleTrade'
  | 'maxSlippagePct'
  | 'minBalance';

export interface FormState {
  mode: CopySettings['mode'];
  sizingMode: CopySettings['sizingMode'];
  numbers: Record<NumericKey, string>;
  allowedCategories: string[];
  excludedMarkets: string[];
  walletAddress: string;
}

export const PRESET_CATEGORIES = ['Crypto', 'Politics', 'Sports'] as const;

export function toFormState(s: SettingsInput): FormState {
  return {
    mode: s.mode,
    sizingMode: s.sizingMode,
    numbers: {
      fixedAmount: String(s.fixedAmount),
      percentage: String(s.percentage),
      minCopyAmount: String(s.minCopyAmount),
      maxPerTrade: String(s.maxPerTrade),
      maxDailyAmount: String(s.maxDailyAmount),
      maxOpenPositions: String(s.maxOpenPositions),
      minWhaleTrade: String(s.minWhaleTrade),
      maxSlippagePct: String(+(s.maxSlippage * 100).toFixed(4)),
      minBalance: String(s.minBalance),
    },
    allowedCategories: [...s.allowedCategories],
    excludedMarkets: [...s.excludedMarkets],
    walletAddress: s.walletAddress ?? '',
  };
}

const n = (v: string) => (v.trim() === '' ? Number.NaN : Number(v));

export function toSettings(f: FormState): SettingsInput {
  return {
    mode: f.mode,
    sizingMode: f.sizingMode,
    fixedAmount: n(f.numbers.fixedAmount),
    percentage: n(f.numbers.percentage),
    minCopyAmount: n(f.numbers.minCopyAmount),
    maxPerTrade: n(f.numbers.maxPerTrade),
    maxDailyAmount: n(f.numbers.maxDailyAmount),
    maxOpenPositions: n(f.numbers.maxOpenPositions),
    minWhaleTrade: n(f.numbers.minWhaleTrade),
    maxSlippage: n(f.numbers.maxSlippagePct) / 100,
    minBalance: n(f.numbers.minBalance),
    // Manual mode always requires confirmation; automatic applies only where the backend allows it.
    confirmationRequired: f.mode === 'MANUAL',
    allowedCategories: f.allowedCategories,
    excludedMarkets: f.excludedMarkets,
    walletAddress: f.walletAddress.trim() === '' ? null : f.walletAddress.trim(),
  };
}

/** Maps schema paths to form field ids. */
const FIELD_OF: Record<string, string> = { maxSlippage: 'maxSlippagePct' };

/**
 * Detects secrets pasted by mistake: a raw 32-byte hex private key or a 12/24-word mnemonic.
 * PolyMirror never needs either.
 */
export function looksLikeSecret(v: string): boolean {
  const t = v.trim();
  if (/^(0x)?[a-fA-F0-9]{64}$/.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  return words.length >= 12 && words.every((w) => /^[a-z]+$/i.test(w));
}

export interface ValidationResult {
  ok: boolean;
  value?: SettingsInput;
  errors: Record<string, string>;
}

export function validate(f: FormState): ValidationResult {
  if (looksLikeSecret(f.walletAddress)) {
    return {
      ok: false,
      errors: {
        walletAddress:
          'This looks like a private key or seed phrase. Never enter it anywhere — only your public 0x address.',
      },
    };
  }
  const candidate = toSettings(f);
  const parsed = copySettingsInputSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, value: parsed.data as SettingsInput, errors: {} };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    const field = FIELD_OF[key] ?? key;
    if (!errors[field]) {
      errors[field] = issue.code === 'invalid_type' ? 'Enter a number' : issue.message;
    }
  }
  return { ok: false, errors };
}

/** Maps server field errors (paths like "maxSlippage") onto form field ids. */
export function mapServerErrors(fieldErrors: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fieldErrors)) out[FIELD_OF[k] ?? k] = v;
  return out;
}
