/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Unified userId source for the frontend.
 * Priority: URL ?userId= > localStorage > 'default-user'
 */

const STORAGE_KEY = 'cat-cafe-userId';
const SKIP_AUTH_KEY = 'cat-cafe-isskip';
const CAN_CREATE_MODEL_KEY = 'can-create-model';
const USER_NAME_KEY = 'cat-cafe-userName';
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

export function setAuthIdentity({ userId, userName }: { userId: string; userName?: string }): void {
  setUserId(userId);
  if (typeof userName === 'string') {
    setUserName(userName);
  }
}

export function clearAuthIdentity(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
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
