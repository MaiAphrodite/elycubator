import { createHmac } from "crypto";

export const hashPassword = (plain: string): Promise<string> =>
  Bun.password.hash(plain, { algorithm: "argon2id" });

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  Bun.password.verify(plain, hash);

export const generateSecret = (): string =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");

export const computeHmac = (data: string, secret: string): string =>
  createHmac("sha256", secret).update(data).digest("hex");

export const verifyHmac = (data: string, secret: string, received: string): boolean => {
  const expected = computeHmac(data, secret);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
};

function timingSafeEqual(a: string, b: string): boolean {
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
