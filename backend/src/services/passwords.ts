import bcrypt from 'bcrypt';

/** Cost factor for bcrypt. 10 keeps seed and login snappy on a prototype. */
const BCRYPT_ROUNDS = 10;

export function hashPassword(plainPassword: string): string {
  return bcrypt.hashSync(plainPassword, BCRYPT_ROUNDS);
}

export function verifyPassword(plainPassword: string, passwordHash: string): boolean {
  return bcrypt.compareSync(plainPassword, passwordHash);
}
