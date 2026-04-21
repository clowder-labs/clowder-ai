export interface AuthFieldOption {
  value: string;
  label: string;
}

export interface AuthFieldSchema {
  name: string;
  label: string;
  type: 'text' | 'password' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: AuthFieldOption[];
}

export interface AuthProviderInfo {
  id: string;
  displayName: string;
  mode: 'auto' | 'form' | 'redirect';
  fields: AuthFieldSchema[];
  submitLabel?: string;
  description?: string;
}

export function buildInitialAuthFormValues(fields: AuthFieldSchema[]): Record<string, string> {
  return fields.reduce<Record<string, string>>((acc, field) => {
    acc[field.name] = field.type === 'select' ? field.options?.[0]?.value ?? '' : '';
    return acc;
  }, {});
}

export function shouldRenderAuthField(field: AuthFieldSchema, hasCode: boolean): boolean {
  return !(field.name === 'promotionCode' && hasCode);
}
