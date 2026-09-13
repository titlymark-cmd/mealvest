import bcrypt from "bcrypt";

/**
 * bcrypt over argon2 for MEALVEST: argon2 is the stronger algorithm on
 * paper, but it needs native bindings that complicate deployment on
 * some low-resource hosts we might target for a campus pilot (and
 * some serverless environments outright reject native builds without
 * extra config). bcrypt is battle-tested for 20+ years, its bindings
 * are broadly compatible, and its cost factor is easy to tune later
 * if hardware changes. For MEALVEST's threat model (a campus meal app,
 * not a bank) this is the pragmatic choice.
 */
const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
