'use client';

import { forwardRef, type TextareaHTMLAttributes } from 'react';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  containerClassName?: string;
  counterClassName?: string;
  showCount?: boolean;
  formatCount?: (current: number, maxLength?: number) => string;
  useDefaultContainerStyles?: boolean;
  useDefaultTextareaStyles?: boolean;
};

function getControlledTextLength(value: TextareaProps['value']): number {
  if (typeof value === 'string') return value.length;
  if (typeof value === 'number') return String(value).length;
  return 0;
}

function joinClassNames(...values: Array<string | undefined | false | null>): string | undefined {
  const next = values.filter(Boolean).join(' ');
  return next || undefined;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    containerClassName,
    counterClassName,
    className,
    showCount = false,
    formatCount,
    maxLength,
    useDefaultContainerStyles = true,
    useDefaultTextareaStyles = true,
    value,
    ...props
  },
  ref,
) {
  const currentLength = getControlledTextLength(value);
  const resolvedContainerClassName = joinClassNames(
    useDefaultContainerStyles ? 'ui-field ui-form-focus-within relative pl-3 pt-2 pb-4 bg-[var(--surface-panel)]' : null,
    containerClassName,
  );
  const resolvedTextareaClassName = joinClassNames(
    useDefaultTextareaStyles ? 'ui-textarea ui-textarea-plain w-full pr-3 rounded-none text-[12px]' : null,
    className,
  );
  const resolvedCounterClassName = joinClassNames(
    'pointer-events-none absolute bottom-0 right-4 text-[12px] text-[var(--text-muted)]',
    counterClassName,
  );

  return (
    <div className={resolvedContainerClassName}>
      <textarea ref={ref} value={value} maxLength={maxLength} className={resolvedTextareaClassName} {...props} />
      {showCount ? (
        <div className={resolvedCounterClassName}>
          {formatCount ? formatCount(currentLength, maxLength) : `${currentLength}`}
        </div>
      ) : null}
    </div>
  );
});
