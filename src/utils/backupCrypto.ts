declare const Buffer: {
  from(data: Uint8Array | string, encoding?: string): { toString(e: string): string; length: number };
  concat(list: unknown[]): { toString(e: string): string; length: number } & Uint8Array;
};
// Minimal TextEncoder/TextDecoder + SubtleCrypto globals for RN/Hermes
declare class TextEncoder {
  encode(input: string): Uint8Array;
}
declare class TextDecoder {
  decode(input: Uint8Array): string;
}
declare type SubtleCrypto = {
  importKey(a: string, b: Uint8Array, c: unknown, d: boolean, e: string[]): Promise<unknown>;
  deriveKey(a: unknown, b: unknown, c: unknown, d: boolean, e: string[]): Promise<unknown>;
  encrypt(a: unknown, b: unknown, c: Uint8Array | unknown): Promise<ArrayBuffer>;
  decrypt(a: unknown, b: unknown, c: Uint8Array | unknown): Promise<ArrayBuffer>;
};

type EncryptResult = {
  saltHex: string;
  ivHex: string;
  authTagHex: string;
  dataBase64: string;
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

const textEncode = (value: string): Uint8Array => {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) % 256;
  // For non-ASCII, fallback to UTF-8 via encodeURIComponent trick
  if (value.length !== unescape(encodeURIComponent(value)).length) {
    return new TextEncoder().encode(value);
  }
  return bytes;
};

const textDecode = (bytes: Uint8Array): string => {
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
    return out;
  }
};

const getNodeCrypto = (): unknown => {
  try {
    return require('crypto');
  } catch {
    return null;
  }
};

const randomBytes = (length: number): Uint8Array => {
  const webCrypto = (globalThis as unknown as { crypto?: { getRandomValues(b: Uint8Array): Uint8Array } })
    .crypto;
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    const buf = new Uint8Array(length);
    webCrypto.getRandomValues(buf);
    return buf;
  }
  const nodeCrypto = getNodeCrypto() as { randomBytes?: (n: number) => Uint8Array } | null;
  if (nodeCrypto && typeof nodeCrypto.randomBytes === 'function') {
    const out = nodeCrypto.randomBytes(length) as unknown as Uint8Array;
    return out instanceof Uint8Array ? out : new Uint8Array(out as unknown as ArrayBuffer);
  }
  const fallback = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) fallback[i] = Math.floor(Math.random() * 256);
  return fallback;
};

export const encryptString = async (plaintext: string, password: string): Promise<string> => {
  if (!password || password.length < 4) throw new Error('password minimal 4 karakter');
  const nodeCrypto = getNodeCrypto() as
    | {
        scryptSync: (p: string | unknown, s: unknown, keylen: number, opts?: unknown) => unknown;
        createCipheriv: (a: string, k: unknown, iv: unknown) => {
          update(d: unknown): unknown;
          final(): unknown;
          getAuthTag(): unknown;
        };
      }
    | null;

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const plainBuf = (Buffer as unknown as { from(b: Uint8Array): unknown }).from(textEncode(plaintext));

  if (nodeCrypto && typeof nodeCrypto.scryptSync === 'function') {
    const key = nodeCrypto.scryptSync(password, (Buffer as unknown as { from(b: Uint8Array): unknown }).from(salt), 32, {
      N: 16384,
      r: 8,
      p: 1,
    });
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, (Buffer as unknown as { from(b: Uint8Array): unknown }).from(iv));
    const encrypted = (Buffer as unknown as { concat(a: unknown[]): { toString(e: string): string } }).concat([cipher.update(plainBuf), cipher.final()]);
    const tag = cipher.getAuthTag() as unknown as Uint8Array;
    const envelope: EncryptResult = {
      saltHex: toHex(salt),
      ivHex: toHex(iv),
      authTagHex: toHex(new Uint8Array(tag as unknown as ArrayBuffer)),
      dataBase64: (encrypted as { toString(e: string): string }).toString('base64'),
    };
    return JSON.stringify(envelope);
  }

  // Fallback WebCrypto (Hermes with subtle)
  const subtle = (globalThis as unknown as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) throw new Error('enkripsi tidak tersedia di environment ini');

  // Derive key via PBKDF2 as fallback (scrypt-js would be ideal but heavy)
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, [
    'deriveKey',
  ]);
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const encoded = await subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, plainBuf);
  const combined = new Uint8Array(encoded);
  // WebCrypto AES-GCM appends tag (16 bytes) at end
  const data = combined.slice(0, combined.length - 16);
  const tag = combined.slice(combined.length - 16);
  const envelope: EncryptResult = {
    saltHex: toHex(salt),
    ivHex: toHex(iv),
    authTagHex: toHex(tag),
    dataBase64: (Buffer as unknown as { from(b: Uint8Array): { toString(e: string): string } }).from(data).toString('base64'),
  };
  return JSON.stringify(envelope);
};

export const decryptString = async (ciphertext: string, password: string): Promise<string> => {
  const envelope: EncryptResult = JSON.parse(ciphertext) as EncryptResult;
  if (!envelope.saltHex || !envelope.ivHex || !envelope.dataBase64 || !envelope.authTagHex) {
    throw new Error('format terenkripsi tidak valid');
  }
  const nodeCrypto = getNodeCrypto() as
    | {
        scryptSync: (p: string | unknown, s: unknown, keylen: number, opts?: unknown) => unknown;
        createDecipheriv: (a: string, k: unknown, iv: unknown) => {
          update(d: unknown): unknown;
          final(): unknown;
          setAuthTag(b: unknown): unknown;
        };
      }
    | null;

  const salt = fromHex(envelope.saltHex);
  const iv = fromHex(envelope.ivHex);
  const tag = fromHex(envelope.authTagHex);
  const data = (Buffer as unknown as { from(s: string, e: string): unknown }).from(envelope.dataBase64, 'base64');

  if (nodeCrypto && typeof nodeCrypto.scryptSync === 'function') {
    const key = nodeCrypto.scryptSync(password, (Buffer as unknown as { from(b: Uint8Array): unknown }).from(salt), 32, {
      N: 16384,
      r: 8,
      p: 1,
    });
    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, (Buffer as unknown as { from(b: Uint8Array): unknown }).from(iv));
    decipher.setAuthTag((Buffer as unknown as { from(b: Uint8Array): unknown }).from(tag));
    const decrypted = (Buffer as unknown as { concat(a: unknown[]): unknown }).concat([decipher.update(data), decipher.final()]) as Uint8Array;
    return textDecode(new Uint8Array(decrypted));
  }

  const subtle = (globalThis as unknown as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) throw new Error('dekripsi tidak tersedia di environment ini');
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, [
    'deriveKey',
  ]);
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const d = data as unknown as Uint8Array;
  const combined = new Uint8Array(d.length + tag.length);
  combined.set(d, 0);
  combined.set(tag, d.length);
  const plainBuf = await subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    combined,
  );
  return textDecode(new Uint8Array(plainBuf as ArrayBuffer));
};
