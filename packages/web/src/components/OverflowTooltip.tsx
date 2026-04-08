'use client';

import {
  cloneElement,
  type CSSProperties,
  type ElementType,
  isValidElement,
  type ReactElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

const VIEWPORT_PADDING = 12;
const TOOLTIP_GAP = 10;
const TOOLTIP_ARROW_SIZE = 6;
const TOOLTIP_MAX_WIDTH = 480;

type TooltipPlacement = 'top' | 'bottom';

type TooltipPosition = {
  top: number;
  left: number;
  maxWidth: number;
  placement: TooltipPlacement;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function useTooltipPositioning(content: string) {
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
      const maxWidth = Math.max(160, Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth - VIEWPORT_PADDING * 2));
      const tooltipWidth = Math.min(tooltipRect.width || maxWidth, maxWidth);
      const tooltipHeight = tooltipRect.height;

      const preferredLeft = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;
      const left = clamp(preferredLeft, VIEWPORT_PADDING, window.innerWidth - tooltipWidth - VIEWPORT_PADDING);

      const topAbove = triggerRect.top - tooltipHeight - TOOLTIP_GAP - TOOLTIP_ARROW_SIZE;
      const topBelow = triggerRect.bottom + TOOLTIP_GAP + TOOLTIP_ARROW_SIZE;
      const shouldPlaceAbove =
        topAbove >= VIEWPORT_PADDING ||
        topBelow + tooltipHeight > window.innerHeight - VIEWPORT_PADDING;

      setPosition({
        top: shouldPlaceAbove ? Math.max(VIEWPORT_PADDING, topAbove) : topBelow,
        left,
        maxWidth: Math.min(maxWidth, TOOLTIP_MAX_WIDTH),
        placement: shouldPlaceAbove ? 'top' : 'bottom',
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [content, open]);

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
        maxWidth: `min(${TOOLTIP_MAX_WIDTH}px, calc(100vw - ${VIEWPORT_PADDING * 2}px))`,
      };

  return {
    triggerRef,
    tooltipRef,
    tooltipId,
    open,
    setOpen,
    tooltipStyle,
    placement: position?.placement ?? 'top',
  };
}

function TooltipPortal({
  open,
  tooltipId,
  tooltipRef,
  tooltipStyle,
  content,
  placement,
}: {
  open: boolean;
  tooltipId: string;
  tooltipRef: React.MutableRefObject<HTMLDivElement | null>;
  tooltipStyle: CSSProperties | undefined;
  content: string;
  placement: TooltipPlacement;
}) {
  if (!open) return null;

  const arrowClass =
    placement === 'top'
      ? 'absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-white'
      : 'absolute bottom-full left-1/2 h-0 w-0 -translate-x-1/2 border-x-[6px] border-b-[6px] border-x-transparent border-b-white';

  return createPortal(
    <div
      ref={tooltipRef}
      id={tooltipId}
      role="tooltip"
      data-placement={placement}
      className="pointer-events-none z-[1000]"
      style={tooltipStyle}
    >
      <div className="relative rounded-lg bg-white px-3 py-2 text-xs leading-5 text-[#222222] shadow-[0px_2px_12px_0px_rgba(0,0,0,0.16)] whitespace-normal break-words">
        <span>{content}</span>
        <span data-testid="overflow-tooltip-arrow" className={arrowClass} aria-hidden="true" />
      </div>
    </div>,
    document.body,
  );
}

function isOverflowed(node: HTMLElement): boolean {
  return node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight;
}

export function OverflowTooltip({
  content,
  className,
  textClassName,
  as: Component = 'span',
  children,
  forceShow = false,
}: {
  content: string;
  className?: string;
  textClassName?: string;
  as?: ElementType;
  children?: ReactElement;
  forceShow?: boolean;
}) {
  const contentRef = useRef<HTMLElement | null>(null);
  const { triggerRef, tooltipRef, tooltipId, open, setOpen, tooltipStyle, placement } = useTooltipPositioning(content);

  const handleOpen = () => {
    const node = contentRef.current;
    if (!node) return;
    setOpen(forceShow || isOverflowed(node));
  };

  const renderedContent = children
    ? isValidElement(children)
      ? cloneElement(children, { ref: contentRef } as { ref: typeof contentRef })
      : children
    : cloneElement(<Component className={textClassName}>{content}</Component>, { ref: contentRef } as {
        ref: typeof contentRef;
      });

  return (
    <div
      ref={triggerRef}
      className={className}
      onMouseOver={handleOpen}
      onMouseOut={() => setOpen(false)}
      onFocus={handleOpen}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? tooltipId : undefined}
    >
      {renderedContent}
      <TooltipPortal
        open={open}
        tooltipId={tooltipId}
        tooltipRef={tooltipRef}
        tooltipStyle={tooltipStyle}
        content={content}
        placement={placement}
      />
    </div>
  );
}
