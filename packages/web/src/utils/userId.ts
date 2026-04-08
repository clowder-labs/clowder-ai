/**
 * Unified identity source for the frontend.
 * userId: display/legacy identifier
 * sessionId: opaque session credential sent to API via Authorization header
 */

const STORAGE_KEY = 'cat-cafe-userId';
const SESSION_KEY = 'cat-cafe-sessionId';
const SKIP_AUTH_KEY = 'cat-cafe-isskip';
const DEFAULT_USER = 'default-user';

export function getUserId(): string {
  if (typeof window === 'undefined') return DEFAULT_USER;
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_USER;
}

export function setUserId(id: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, id);
  }
}

export function clearUserId(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
  }
}

export function getSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SESSION_KEY);
}

export function setSessionId(id: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_KEY, id);
  }
}

export function clearSessionId(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_KEY);
  }
}

export function getIsSkipAuth(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = localStorage.getItem(SKIP_AUTH_KEY);
  return raw === '1' || raw === 'true';
}

export function setIsSkipAuth(value: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SKIP_AUTH_KEY, value ? '1' : '0');
  }
}
