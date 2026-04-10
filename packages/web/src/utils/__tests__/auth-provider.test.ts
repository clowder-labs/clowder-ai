import { describe, expect, it } from 'vitest';
import { buildInitialAuthFormValues, shouldRenderAuthField } from '@/utils/auth-provider';

describe('auth-provider utils', () => {
  it('builds initial form values from field schema', () => {
    expect(
      buildInitialAuthFormValues([
        { name: 'workspaceId', label: 'Workspace', type: 'text', required: true },
        {
          name: 'userType',
          label: 'User Type',
          type: 'select',
          options: [
            { value: 'huawei', label: 'Huawei' },
            { value: 'iam', label: 'IAM' },
          ],
        },
      ]),
    ).toEqual({
      workspaceId: '',
      userType: 'huawei',
    });
  });

  it('hides promotionCode until the backend requests it', () => {
    expect(
      shouldRenderAuthField({ name: 'promotionCode', label: '邀请码', type: 'text', required: false }, true),
    ).toBe(false);
    expect(
      shouldRenderAuthField({ name: 'promotionCode', label: '邀请码', type: 'text', required: false }, false),
    ).toBe(true);
  });
});
