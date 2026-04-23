/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Unified frontend identity store.
 *
 * `userId` is a display/legacy identifier.
 * `sessionId` is the opaque auth credential used for API requests.
 */

const STORAGE_KEY = 'office-claw-userId';
const SESSION_KEY = 'office-claw-sessionId';
const SKIP_AUTH_KEY = 'office-claw-isskip';
const CAN_CREATE_MODEL_KEY = 'can-create-model';
const USER_NAME_KEY = 'office-claw-userName';
const DEFAULT_USER = 'default-user';

export function getUserId(): string {
  if (typeof window === 'undefined') return DEFAULT_USER;

  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('userId');
  if (fromUrl) {
    localStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl;
  }

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

export function getUserName(): string {
  if (typeof window === 'undefined') return '';
  const stored = localStorage.getItem(USER_NAME_KEY);
  if (stored) return stored;

  const userId = localStorage.getItem(STORAGE_KEY) ?? '';
  const parts = userId.split(':');
  return parts.length > 1 ? parts[1] || parts[0] : userId;
}

export function getDomainId(): string {
  const userId = getUserId();
  const separatorIndex = userId.indexOf(':');
  return separatorIndex > 0 ? userId.slice(0, separatorIndex) : '';
}

export function setUserName(name: string): void {
  if (typeof window !== 'undefined') {
    if (name.trim()) {
      localStorage.setItem(USER_NAME_KEY, name.trim());
    } else {
      localStorage.removeItem(USER_NAME_KEY);
    }
  }
}

export function setAuthIdentity({
  userId,
  userName,
  sessionId,
}: {
  userId: string;
  userName?: string;
  sessionId?: string;
}): void {
  setUserId(userId);
  if (typeof userName === 'string') {
    setUserName(userName);
  }
  if (typeof sessionId === 'string' && sessionId.trim()) {
    setSessionId(sessionId);
  }
}

export function clearAuthIdentity(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_NAME_KEY);
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

export function getCanCreateModel(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = localStorage.getItem(CAN_CREATE_MODEL_KEY);
  return raw === '1' || raw === 'true';
}

export function setCanCreateModel(value: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(CAN_CREATE_MODEL_KEY, value ? '1' : '0');
  }
}
