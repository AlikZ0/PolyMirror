import type { AssistedOrderHint } from '../types/settings';

/**
 * Read-only informational panel shown on polymarket.com with the order the user prepared in
 * PolyMirror. It is rendered in a closed Shadow DOM using textContent only (no innerHTML).
 *
 * It NEVER clicks, fills inputs, submits forms or otherwise automates the page: the user places
 * the order on Polymarket by hand.
 */

const HOST_ID = 'polymirror-assist-overlay';

const STYLE = `
  :host { all: initial; }
  .panel { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 300px;
    font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    background: #121722; color: #e6e9ef; border: 1px solid #263041; border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0,0,0,.45); overflow: hidden; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 10px 12px; border-bottom: 1px solid #263041; font-weight: 700; }
  button { all: unset; cursor: pointer; color: #8b95a7; padding: 2px 6px; border-radius: 6px; }
  button:hover, button:focus-visible { color: #e6e9ef; background: #1a2130; outline: 2px solid #3b82f6; }
  dl { margin: 0; padding: 10px 12px; display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; }
  dt { color: #8b95a7; }
  dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; word-break: break-word; }
  .amount { color: #22c55e; font-weight: 700; }
  p { margin: 0; padding: 8px 12px 12px; color: #8b95a7; font-size: 12px; border-top: 1px solid #263041; }
`;

function money(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}

export function removeOverlay(doc: Document = document): void {
  doc.getElementById(HOST_ID)?.remove();
}

export function renderOverlay(
  hint: AssistedOrderHint,
  onDismiss: () => void,
  doc: Document = document,
): void {
  removeOverlay(doc);
  const host = doc.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'closed' });

  const style = doc.createElement('style');
  style.textContent = STYLE;

  const panel = doc.createElement('section');
  panel.className = 'panel';
  panel.setAttribute('role', 'complementary');
  panel.setAttribute('aria-label', 'PolyMirror prepared order');

  const header = doc.createElement('header');
  const title = doc.createElement('span');
  title.textContent = '🐋 PolyMirror — prepared order';
  const close = doc.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss PolyMirror panel');
  close.textContent = '✕';
  close.addEventListener('click', () => {
    removeOverlay(doc);
    onDismiss();
  });
  header.append(title, close);

  const dl = doc.createElement('dl');
  const rows: Array<[string, string, string?]> = [
    ['Market', hint.marketTitle ?? 'N/A'],
    ['Outcome', hint.outcome ?? 'N/A'],
    ['Side', hint.side],
    ['Amount', money(hint.amount), 'amount'],
    ['Est. shares', hint.estimatedShares.toFixed(2)],
    ['Price', hint.price === null ? 'N/A' : `$${hint.price.toFixed(3)}`],
  ];
  for (const [k, v, cls] of rows) {
    const dt = doc.createElement('dt');
    dt.textContent = k;
    const dd = doc.createElement('dd');
    dd.textContent = v;
    if (cls) dd.className = cls;
    dl.append(dt, dd);
  }

  const note = doc.createElement('p');
  note.textContent =
    'Place this order yourself on Polymarket. PolyMirror does not click or fill anything on this page. ' +
    'Then return to PolyMirror and press "I placed the order" so it can verify the fill.';

  panel.append(header, dl, note);
  root.append(style, panel);
  (doc.body ?? doc.documentElement).append(host);
}
