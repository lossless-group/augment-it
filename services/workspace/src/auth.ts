// Opaque session tokens, JSON-file-backed. Phase 1: just enough to mint and
// validate. Pre-flight D4 contract: auto-mint on first contact, validate on
// reconnect. No OAuth, no real users — that's a later concern.

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

type SessionMap = Record<string, { created_at: string }>;

let sessions: SessionMap = {};
let storePath = '';

export async function loadSessions(path: string): Promise<void> {
  storePath = path;
  try {
    const raw = await readFile(path, 'utf8');
    sessions = JSON.parse(raw);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      await mkdir(dirname(path), { recursive: true });
      sessions = {};
      await persist();
    } else {
      throw err;
    }
  }
}

async function persist(): Promise<void> {
  await writeFile(storePath, JSON.stringify(sessions, null, 2));
}

export function isValid(token: string | undefined | null): boolean {
  if (!token) return false;
  return Object.hasOwn(sessions, token);
}

export async function mint(): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  sessions[token] = { created_at: new Date().toISOString() };
  await persist();
  return token;
}
