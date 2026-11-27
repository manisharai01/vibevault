// Hashing, HMAC and RSA signing helpers on top of WebCrypto (available in Deno,
// Node 18+ and the browser), used by marketplace APIs that sign requests.

const encoder = new TextEncoder();

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('WebCrypto (crypto.subtle) is not available in this runtime.');
  return s;
}

const bytesOf = (data: string | Uint8Array): Uint8Array => (typeof data === 'string' ? encoder.encode(data) : data);

/** Copies into a fresh ArrayBuffer (WebCrypto rejects views over shared or offset buffers in some runtimes). */
function buffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function base64Encode(data: string | Uint8Array): string {
  const bytes = bytesOf(data);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64Decode(text: string): Uint8Array {
  const binary = atob(text.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await subtle().digest('SHA-256', buffer(bytesOf(data)))));
}

export async function hmacSha256(key: string | Uint8Array, data: string | Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await subtle().importKey('raw', buffer(bytesOf(key)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', cryptoKey, buffer(bytesOf(data))));
}

export async function hmacSha256Hex(key: string | Uint8Array, data: string | Uint8Array): Promise<string> {
  return toHex(await hmacSha256(key, data));
}

/**
 * RSASSA-PKCS1-v1_5 / SHA-256 signature of `data`, base64-encoded.
 * `pem` must be an unencrypted PKCS#8 private key ("-----BEGIN PRIVATE KEY-----"), or just
 * its base64 body (handy when the key is stored in a single-line environment variable).
 */
export async function rsaSha256SignBase64(pem: string, data: string): Promise<string> {
  if (/BEGIN (RSA |ENCRYPTED )PRIVATE KEY/.test(pem)) {
    throw new Error('Private key must be unencrypted PKCS#8 ("BEGIN PRIVATE KEY"); convert it with `openssl pkcs8 -topk8 -nocrypt`.');
  }
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  const key = await subtle().importKey(
    'pkcs8',
    buffer(base64Decode(body)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await subtle().sign('RSASSA-PKCS1-v1_5', key, buffer(encoder.encode(data)));
  return base64Encode(new Uint8Array(signature));
}

// ---- MD5 (RFC 1321) ------------------------------------------------------------------
// WebCrypto has no MD5, but AliExpress's TOP-style request signing uses it.

const MD5_S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5Hex(data: string | Uint8Array): string {
  const input = bytesOf(data);
  const bitLength = input.length * 8;
  const padded = new Uint8Array((((input.length + 8) >> 6) + 1) * 64);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLength >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLength / 2 ** 32), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const m = new Uint32Array(16);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) m[i] = view.getUint32(offset + i * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const sum = (a + f + MD5_K[i] + m[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((sum << MD5_S[i]) | (sum >>> (32 - MD5_S[i])))) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((word, i) => outView.setUint32(i * 4, word, true));
  return toHex(out);
}
