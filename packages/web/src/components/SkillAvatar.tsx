import { NameInitialIcon } from './NameInitialIcon';

export function SkillAvatar({
  avatarName,
  avatarUrl,
  className = '',
  imageClassName = '',
  dataTestId,
}: {
  avatarName: string;
  avatarUrl?: string | null;
  className?: string;
  imageClassName?: string;
  dataTestId?: string;
}) {
  const normalizedAvatarUrl = avatarUrl?.trim();

  if (normalizedAvatarUrl) {
    return (
      <img
        src={normalizedAvatarUrl}
        alt={`${avatarName} avatar`}
        data-testid={dataTestId}
        className={`h-12 w-12 shrink-0 rounded-[10px] border border-[var(--border-default)] object-cover shadow-sm ${className} ${imageClassName}`.trim()}
      />
    );
  }

  return <NameInitialIcon name={avatarName} className={className} dataTestId={dataTestId} />;
}
