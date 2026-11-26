// Minimal Deno typings for local type-checking only (the Edge Runtime provides the real ones).
declare namespace Deno {
  function serve(handler: (request: Request) => Response | Promise<Response>): unknown;
  const env: { get(key: string): string | undefined };
}
