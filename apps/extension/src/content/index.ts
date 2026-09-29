/**
 * PolyMirror content script for https://polymarket.com/* (display only).
 * Shows the order prepared in the PolyMirror dashboard as an informational overlay.
 */
import type { AssistedOrderHint } from '../types/settings';
import { removeOverlay, renderOverlay } from './overlay';

const KEY = 'assistedOrder';

function isValidHint(v: unknown): v is AssistedOrderHint {
  if (!v || typeof v !== 'object') return false;
  const h = v as AssistedOrderHint;
  return (
    typeof h.copyOrderId === 'string' &&
    typeof h.amount === 'number' &&
    typeof h.expiresAt === 'number' &&
    (h.side === 'BUY' || h.side === 'SELL')
  );
}

function show(value: unknown): void {
  if (!isValidHint(value) || value.expiresAt < Date.now()) {
    removeOverlay();
    return;
  }
  renderOverlay(value, () => {
    void chrome.storage.local.remove(KEY);
  });
}

void chrome.storage.local.get(KEY).then((res) => show(res[KEY]));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && KEY in changes) show(changes[KEY]?.newValue);
});
