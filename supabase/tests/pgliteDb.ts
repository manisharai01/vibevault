// A Db (the Edge Functions' PostgREST client interface) backed by PGlite, so the refresh and
// live-check code can be tested against the real migrations. Understands the PostgREST query
// syntax the functions use: select=, col=eq|neq|lt|gt|is|in.…, order=col.asc|desc, limit=.

import type { PGlite } from '@electric-sql/pglite';
import type { Db } from '../functions/_shared/db.ts';

const ident = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`bad identifier ${name}`);
  return `"${name}"`;
};

function parseInList(raw: string): string[] {
  const inner = raw.replace(/^\(/, '').replace(/\)$/, '');
  const values: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|([^,]+)/g;
  for (const m of inner.matchAll(re)) values.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2]);
  return values;
}

function where(query: string, params: unknown[]): { sql: string; columns: string; order: string; limit: string } {
  const clauses: string[] = [];
  let columns = '*';
  let order = '';
  let limit = '';
  for (const part of query.split('&').filter(Boolean)) {
    const eq = part.indexOf('=');
    const key = decodeURIComponent(part.slice(0, eq));
    const value = decodeURIComponent(part.slice(eq + 1));
    if (key === 'select') {
      columns = value === '*' ? '*' : value.split(',').map(ident).join(', ');
    } else if (key === 'order') {
      const [col, dir] = value.split('.');
      order = ` order by ${ident(col)} ${dir === 'desc' ? 'desc' : 'asc'}`;
    } else if (key === 'limit') {
      limit = ` limit ${Number(value)}`;
    } else if (key === 'on_conflict') {
      continue;
    } else {
      const dot = value.indexOf('.');
      const op = value.slice(0, dot);
      const operand = value.slice(dot + 1);
      const col = ident(key);
      if (op === 'is') clauses.push(`${col} is ${operand === 'null' ? 'null' : operand === 'true' ? 'true' : 'false'}`);
      else if (op === 'in') {
        params.push(parseInList(operand));
        clauses.push(`${col}::text = any($${params.length}::text[])`);
      } else {
        const sqlOp = { eq: '=', neq: '<>', lt: '<', gt: '>', lte: '<=', gte: '>=' }[op];
        if (!sqlOp) throw new Error(`unsupported filter ${part}`);
        params.push(operand);
        clauses.push(`${col}::text ${sqlOp} $${params.length}::text`.replace(
          // timestamps compare as timestamps, not text
          /::text ([<>]=?) \$(\d+)::text/,
          (_m, o, n) => `::timestamptz ${o} $${n}::timestamptz`,
        ));
      }
    }
  }
  return { sql: clauses.length ? ` where ${clauses.join(' and ')}` : '', columns, order, limit };
}

/** Adds a parameter cast to the function argument's declared type (as PostgREST would). */
function castArg(type: string, value: unknown, params: unknown[]): string {
  params.push(type === 'jsonb' || type === 'json' ? JSON.stringify(value) : value);
  return `$${params.length}::${type}`;
}

export function pgliteDb(db: PGlite): Db & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async select<T>(table: string, query: string) {
      calls.push(`select ${table}`);
      const params: unknown[] = [];
      const w = where(query, params);
      const result = await db.query<T>(`select ${w.columns} from ${ident(table)}${w.sql}${w.order}${w.limit}`, params);
      return JSON.parse(JSON.stringify(result.rows)) as T[];
    },
    async insert<T>(table: string, rows: object | object[]) {
      calls.push(`insert ${table}`);
      const list = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[];
      const out: T[] = [];
      for (const row of list) {
        const keys = Object.keys(row);
        const result = await db.query<T>(
          `insert into ${ident(table)} (${keys.map(ident).join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
          keys.map((k) => row[k]),
        );
        out.push(...result.rows);
      }
      return out;
    },
    async update(table: string, query: string, patch: object) {
      calls.push(`update ${table}`);
      const params: unknown[] = [];
      const sets = Object.entries(patch).map(([k, v]) => {
        params.push(v);
        return `${ident(k)} = $${params.length}`;
      });
      const w = where(query, params);
      const result = await db.query(`update ${ident(table)} set ${sets.join(', ')}${w.sql}`, params);
      return result.affectedRows ?? 0;
    },
    async upsert(table: string, rows: object[], onConflict: string) {
      calls.push(`upsert ${table}`);
      for (const row of rows as Record<string, unknown>[]) {
        const keys = Object.keys(row);
        const conflict = onConflict.split(',').map((c) => c.trim());
        const updates = keys.filter((k) => !conflict.includes(k)).map((k) => `${ident(k)} = excluded.${ident(k)}`);
        await db.query(
          `insert into ${ident(table)} (${keys.map(ident).join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})
           on conflict (${conflict.map(ident).join(', ')}) do ${updates.length ? `update set ${updates.join(', ')}` : 'nothing'}`,
          keys.map((k) => row[k]),
        );
      }
    },
    async rpc<T>(fn: string, args: object) {
      calls.push(`rpc ${fn}`);
      const params: unknown[] = [];
      const meta = await db.query<{ retset: boolean; names: string[]; types: string[] }>(
        `select proretset as retset, proargnames as names, array(select format_type(t, null) from unnest(proargtypes) as t) as types
         from pg_proc where proname = $1 limit 1`,
        [fn],
      );
      const declared = meta.rows[0];
      const typeOf = (name: string) => declared?.types[declared.names.indexOf(name)] ?? 'text';
      const named = Object.entries(args).map(([name, value]) => `${ident(name)} => ${castArg(typeOf(name), value, params)}`);
      if (meta.rows[0]?.retset) {
        const result = await db.query(`select * from ${ident(fn)}(${named.join(', ')})`, params);
        return JSON.parse(JSON.stringify(result.rows)) as T;
      }
      const result = await db.query<{ v: unknown }>(`select ${ident(fn)}(${named.join(', ')}) as v`, params);
      return JSON.parse(JSON.stringify(result.rows[0]?.v ?? null)) as T;
    },
  };
}
