import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT';

export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  department_id: number | null;
  linked_student_id: number | null;
  linked_faculty_id: number | null;
  avatar_url: string | null;
  status: string;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

const SESSION_COOKIE = 'acb_session';
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto
    .createHash('sha256')
    .update(process.cwd() + '_akhuwat_campus_brain_secret_v1')
    .digest('hex');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

interface TokenPayload {
  uid: number;
  email: string;
  role: UserRole;
  exp: number;
}

export function signSessionToken(user: Pick<AuthUser, 'id' | 'email' | 'role'>): string {
  const payload: TokenPayload = {
    uid: user.id,
    email: user.email,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!payload.uid || !payload.exp || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      result[k] = v;
    }
  }
  return result;
}

export function setSessionCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    path: '/',
  });
}

export function getUserById(userId: number): AuthUser | null {
  const row = db
    .prepare(
      `SELECT id, email, full_name, role, department_id, linked_student_id, linked_faculty_id, avatar_url, status
       FROM users WHERE id = ?`
    )
    .get(userId) as AuthUser | undefined;
  return row ?? null;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req.headers.cookie);
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : null;
  const token = bearer || cookies[SESSION_COOKIE];

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }

  const user = getUserById(payload.uid);
  if (!user || user.status !== 'Active') {
    res.status(403).json({ error: 'Account is inactive or unavailable.' });
    return;
  }

  req.user = user;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}.`,
      });
      return;
    }
    next();
  };
}

export function logAudit(
  user: Pick<AuthUser, 'id' | 'email' | 'role'> | undefined,
  action: string,
  entityType: string,
  entityId?: string | number | null,
  details?: string
): void {
  try {
    db.prepare(
      `INSERT INTO audit_logs (user_id, user_email, user_role, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      user?.id ?? null,
      user?.email ?? 'system',
      user?.role ?? 'SYSTEM',
      action,
      entityType,
      entityId != null ? String(entityId) : null,
      details ?? null
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}
