'use client';

import { LoadingSmall } from './LoadingSmall';

export function CenteredLoadingState() {
  return (
    <div
      className="flex min-h-0 flex-1 items-center justify-center"
      data-testid="skills-loading-state"
      aria-label="loading"
    >
      <LoadingSmall className="h-4 w-4" />
    </div>
  );
}
