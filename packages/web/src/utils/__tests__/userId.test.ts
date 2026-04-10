import { beforeEach, describe, expect, it } from 'vitest';
import { clearUserId, getUserId, setUserId } from '@/utils/userId';

describe('userId storage', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('reads and clears the persisted user id', () => {
    setUserId('corp:alice');
    expect(getUserId()).toBe('corp:alice');

    clearUserId();
    expect(getUserId()).toBe('default-user');
  });

  it('does not hydrate identity from the URL query string', () => {
    window.history.replaceState({}, '', '/?userId=evil-user');

    expect(getUserId()).toBe('default-user');
    expect(localStorage.getItem('cat-cafe-userId')).toBeNull();
  });
});
