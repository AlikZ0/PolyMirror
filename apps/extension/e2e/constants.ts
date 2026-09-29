import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MOCK_PORT = 4010;
export const EXTENSION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Separate output dir so e2e builds never clobber the regular `dist/`. */
export const E2E_DIST = resolve(EXTENSION_ROOT, '.e2e/dist');
