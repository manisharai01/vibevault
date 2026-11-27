import { createHash, generateKeyPairSync, createVerify } from 'node:crypto';
import { base64Decode, base64Encode, hmacSha256Hex, md5Hex, rsaSha256SignBase64, sha256Hex } from '../../../supabase/functions/_shared/crypto.ts';

describe('crypto helpers', () => {
  it('hashes and signs with the standard test vectors', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    // RFC 4231 test case 2
    expect(await hmacSha256Hex('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('computes MD5 like node:crypto (RFC 1321 vectors and multi-block UTF-8 input)', () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5Hex('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6');
    for (const text of ['x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'naïve café – ₹1,299 – レディース'.repeat(9)]) {
      expect(md5Hex(text)).toBe(createHash('md5').update(text, 'utf8').digest('hex'));
    }
  });

  it('round-trips base64', () => {
    expect(base64Encode('id:secret')).toBe('aWQ6c2VjcmV0');
    expect(Array.from(base64Decode('AAEC/w=='))).toEqual([0, 1, 2, 255]);
  });

  it('produces RSA-SHA256 signatures that verify with the public key', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const signature = await rsaSha256SignBase64(pem, 'consumer\nts\n1\n');
    const verifier = createVerify('RSA-SHA256');
    verifier.update('consumer\nts\n1\n');
    expect(verifier.verify(publicKey, signature, 'base64')).toBe(true);
    // Single-line body (as stored in an env variable) works too.
    const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
    expect(await rsaSha256SignBase64(body, 'x')).toMatch(/^[A-Za-z0-9+/]+=*$/);
    await expect(rsaSha256SignBase64('-----BEGIN RSA PRIVATE KEY-----\nabc', 'x')).rejects.toThrow('PKCS#8');
  });
});
