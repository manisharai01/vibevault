// Small HTTP helpers: timeouts, one retry for transient failures, typed errors.

import type { FetchLike } from './types.ts';

export class HttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504, 599]);

export interface RequestOptions {
  fetch: FetchLike;
  timeoutMs?: number;
  retries?: number;
  /** Label used in error messages, e.g. "Flipkart search". */
  label: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Performs a request and returns the parsed JSON body (null for 404 when `allow404`). */
export async function requestJson<T>(
  url: string,
  init: RequestInit,
  { fetch, timeoutMs = 15000, retries = 1, label }: RequestOptions,
  allow404 = false,
): Promise<T | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.status === 404 && allow404) return null;
      if (!response.ok) {
        const body = (await response.text().catch(() => '')).slice(0, 500);
        const error = new HttpError(`${label} failed with HTTP ${response.status}`, response.status, body);
        if (!RETRYABLE.has(response.status) || attempt === retries) throw error;
        lastError = error;
      } else {
        const text = await response.text();
        return (text ? JSON.parse(text) : null) as T;
      }
    } catch (error) {
      if (error instanceof HttpError && !RETRYABLE.has(error.status)) throw error;
      lastError = error instanceof Error && error.name === 'AbortError' ? new Error(`${label} timed out after ${timeoutMs} ms`) : error;
      if (attempt === retries) break;
    } finally {
      clearTimeout(timer);
    }
    await sleep(400 * (attempt + 1));
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

/** Runs `worker` over `items` with at most `limit` in flight; results keep input order. */
export async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
