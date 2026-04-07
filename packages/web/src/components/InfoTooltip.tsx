'use client';

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

const VIEWPORT_PADDING = 12;
const TOOLTIP_GAP = 10;

type TooltipPosition = {
  top: number;
  left: number;
  maxWidth: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function InfoTooltip({
  content,
  children,
  className,
}: {
  content: string;
  children: ReactNode;
  className?: string;
}) {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;

      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const maxWidth = Math.max(160, window.innerWidth - VIEWPORT_PADDING * 2);
      const tooltipWidth = Math.min(tooltipRect.width || maxWidth, maxWidth);
      const tooltipHeight = tooltipRect.height;

      const preferredLeft = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;
      const left = clamp(preferredLeft, VIEWPORT_PADDING, window.innerWidth - tooltipWidth - VIEWPORT_PADDING);

      const topAbove = triggerRect.top - tooltipHeight - TOOLTIP_GAP;
      const topBelow = triggerRect.bottom + TOOLTIP_GAP;
      const top =
        topAbove >= VIEWPORT_PADDING ||
        topBelow + tooltipHeight > window.innerHeight - VIEWPORT_PADDING
          ? Math.max(VIEWPORT_PADDING, topAbove)
          : topBelow;

      setPosition({ top, left, maxWidth });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, content]);

  useEffect(() => {
    if (!open) {
      setPosition(null);
    }
  }, [open]);

  const tooltipStyle: CSSProperties | undefined = position
    ? {
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        maxWidth: `${position.maxWidth}px`,
      }
    : {
        position: 'fixed',
        top: '-9999px',
        left: '-9999px',
        maxWidth: `min(360px, calc(100vw - ${VIEWPORT_PADDING * 2}px))`,
      };

  return (
    <div
      ref={triggerRef}
      className={className}
      onMouseOver={() => setOpen(true)}
      onMouseOut={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? tooltipId : undefined}
    >
      {children}
      {open
        ? createPortal(
            <div
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none z-[1000] rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-panel)] px-3 py-2 text-xs leading-5 text-[var(--text-primary)] shadow-[var(--shadow-card-hover)] whitespace-normal break-words"
              style={tooltipStyle}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
