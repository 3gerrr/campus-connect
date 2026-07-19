import { createHash } from 'crypto';

// Each chain (announcements for a course, audit log for a university) gets
// its own genesis value, domain-separated by both the scope id and a label
// -- so an announcement chain and an audit log chain that happened to share
// the same scope id would still never collide.
export function genesisHash(scopeId: string, domain: string): string {
  return createHash('sha256').update(`GENESIS:${domain}:${scopeId}`).digest('hex');
}

export function chainHash(parts: (string | number)[]): string {
  return createHash('sha256').update(parts.map(String).join('|')).digest('hex');
}

/**
 * Deterministic JSON serialization: recursively sorts object keys before
 * stringifying.
 *
 * WHY THIS EXISTS: Postgres's `jsonb` column type does not guarantee that
 * key order is preserved across a write/read round-trip -- it's stored in
 * a reorganized binary form, not as the original text. If we hashed
 * `JSON.stringify(metadata)` naively, the hash computed right before
 * insert could mismatch the hash recomputed later after reading the same
 * (semantically unchanged) object back from the database, purely because
 * Postgres reordered keys internally. That would make the verifier report
 * "tampered" on data nobody touched -- a false positive is arguably worse
 * than not verifying at all, since it teaches people to ignore the alarm.
 * Canonicalizing key order before hashing, on both the write and the
 * verify path, removes storage-layer key ordering as a variable entirely.
 */
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJSON).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(record[k])}`).join(',')}}`;
}
