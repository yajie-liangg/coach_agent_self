import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { SqliteStore } from './store.js';
/** Single-owner authentication: password stays server-side, browser receives only an opaque session cookie. */
export class AuthService {
  private salt = randomBytes(16);
  private passwordHash: Buffer;
  constructor(
    private store: SqliteStore,
    password: string,
  ) {
    if (password.length < 12) throw new Error('COACH_PASSWORD 至少需要 12 个字符');
    this.passwordHash = scryptSync(password, this.salt, 32);
  }
  login(password: string): string | null {
    const hash = scryptSync(password, this.salt, 32);
    if (!timingSafeEqual(hash, this.passwordHash)) return null;
    const token = randomBytes(32).toString('base64url');
    this.store.db.prepare('DELETE FROM auth_sessions WHERE expires_at<?').run(Date.now());
    this.store.db
      .prepare('INSERT INTO auth_sessions VALUES(?,?)')
      .run(this.hash(token), Date.now() + 7 * 86400000);
    return token;
  }
  valid(token?: string): boolean {
    if (!token) return false;
    return !!this.store.db
      .prepare('SELECT 1 FROM auth_sessions WHERE token_hash=? AND expires_at>?')
      .get(this.hash(token), Date.now());
  }
  logout(token?: string) {
    if (token)
      this.store.db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(this.hash(token));
  }
  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
