// Minimal PostgREST client for the Edge Functions (service role).
// Uses plain fetch so the functions need no third-party packages.

import { requestJson } from './http.ts';
import type { FetchLike } from './types.ts';

export interface Db {
  select<T>(table: string, query: string): Promise<T[]>;
  insert<T>(table: string, rows: object | object[]): Promise<T[]>;
  update(table: string, query: string, patch: object): Promise<number>;
  upsert(table: string, rows: object[], onConflict: string): Promise<void>;
  rpc<T>(fn: string, args: object): Promise<T>;
}

/** Quotes a value for use inside a PostgREST `in.(...)` filter. */
export function pgrstList(values: string[]): string {
  return `(${values.map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;
}

export function createDb(supabaseUrl: string, serviceKey: string, fetch: FetchLike): Db {
  const base = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1`;
  const headers: Record<string, string> = {
    apikey: serviceKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  // Legacy service_role keys are JWTs and go in Authorization; new sb_secret_ keys only need `apikey`.
  if (serviceKey.startsWith('eyJ')) headers.Authorization = `Bearer ${serviceKey}`;
  // Reads, idempotent updates/upserts and the idempotent ingest RPC may retry; plain inserts may not.
  const opts = (label: string, retries = 1) => ({ fetch, label, retries, timeoutMs: 20000 });

  return {
    async select<T>(table: string, query: string) {
      return (await requestJson<T[]>(`${base}/${table}?${query}`, { headers }, opts(`DB select ${table}`))) ?? [];
    },
    async insert<T>(table: string, rows: object | object[]) {
      return (
        (await requestJson<T[]>(
          `${base}/${table}`,
          { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(rows) },
          opts(`DB insert ${table}`, 0),
        )) ?? []
      );
    },
    async update(table: string, query: string, patch: object) {
      const rows = await requestJson<unknown[]>(
        `${base}/${table}?${query}`,
        { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(patch) },
        opts(`DB update ${table}`),
      );
      return rows?.length ?? 0;
    },
    async upsert(table: string, rows: object[], onConflict: string) {
      if (rows.length === 0) return;
      await requestJson(
        `${base}/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
        {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(rows),
        },
        opts(`DB upsert ${table}`),
      );
    },
    async rpc<T>(fn: string, args: object) {
      return (await requestJson<T>(
        `${base}/rpc/${fn}`,
        { method: 'POST', headers, body: JSON.stringify(args) },
        opts(`DB rpc ${fn}`),
      )) as T;
    },
  };
}
