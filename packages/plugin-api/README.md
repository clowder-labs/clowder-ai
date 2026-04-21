# @clowder/plugin-api

Plugin contracts for Cat Cafe extensions. Auth is the first extension point.

## Install

```bash
pnpm add @clowder/plugin-api
```

## Auth Provider Contract

```ts
import type { AuthProvider } from '@clowder/plugin-api/auth';

const myProvider: AuthProvider = {
  id: 'my-provider',
  displayName: 'My Provider',
  presentation: {
    mode: 'form',
    fields: [
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
    submitLabel: 'Sign In',
  },
  async authenticate(input) {
    // Your authentication logic
    return {
      success: true,
      principal: {
        userId: input.credentials.username as string,
        displayName: 'User',
        expiresAt: null,
      },
    };
  },
};

export default myProvider;
```

See [Build an Auth Provider](../../docs/guides/build-auth-provider.md) for the full walkthrough.
