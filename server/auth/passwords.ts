// Password hashing with Node's built-in scrypt (memory-hard, no extra deps).
// Stored format: scrypt$<N>$<salt b64>$<hash b64>
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "crypto";

const N = 16384;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, n: number): Promise<Buffer> {
  const opts: ScryptOptions = { N: n, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, N);
  return `scrypt$${N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !n || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), Number(n));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Used when the email doesn't exist, so login takes the same time either way
// (prevents discovering which emails have accounts by timing).
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("not-a-real-password");
  await verifyPassword(password, await dummyHash);
}
