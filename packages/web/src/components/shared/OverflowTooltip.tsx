'use client';

import {
  cloneElement,
  type CSSProperties,
  type ElementType,
  isValidElement,
  type ReactElement,
  useCallback,
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
const TOOLTIP_MAX_WIDTH = 328;

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
  copyable,
  copied,
  onTooltipEnter,
  onTooltipLeave,
  onCopy,
}: {
  open: boolean;
  tooltipId: string;
  tooltipRef: React.MutableRefObject<HTMLDivElement | null>;
  tooltipStyle: CSSProperties | undefined;
  content: string;
  placement: TooltipPlacement;
  copyable: boolean;
  copied: boolean;
  onTooltipEnter: () => void;
  onTooltipLeave: () => void;
  onCopy: () => void;
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
      className={`${copyable ? 'pointer-events-auto' : 'pointer-events-none'} z-[1000]`}
      style={tooltipStyle}
      onMouseEnter={onTooltipEnter}
      onMouseLeave={onTooltipLeave}
    >
      <div className="relative rounded-lg bg-white px-3 py-2 text-xs leading-5 text-[#222222] shadow-[0px_2px_12px_0px_rgba(0,0,0,0.16)] whitespace-normal break-all">
        <div className="flex items-center gap-1.5">
          <span className={`min-w-0 flex-1 ${copyable ? 'select-text' : ''}`}>{content}</span>
          {copyable && (
            <button
              type="button"
              onClick={onCopy}
              aria-label="复制"
              title="复制"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#666666] transition-colors hover:text-[#1476ff]"
            >
              {copied ? (
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                  <path
                    d="M4.5 10.5L8 14l7.5-7.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 1024 1024" version="1.1" fill="currentColor" aria-hidden="true">
                  <path d="M337.28 138.688a27.968 27.968 0 0 0-27.968 27.968v78.72h377.344c50.816 0 92.032 41.152 92.032 91.968v377.344h78.656a28.032 28.032 0 0 0 27.968-28.032V166.656a28.032 28.032 0 0 0-27.968-27.968H337.28z m441.408 640v78.656c0 50.816-41.216 91.968-92.032 91.968H166.656a92.032 92.032 0 0 1-91.968-91.968V337.28c0-50.816 41.152-92.032 91.968-92.032h78.72V166.656c0-50.816 41.152-91.968 91.968-91.968h520c50.816 0 91.968 41.152 91.968 91.968v520c0 50.816-41.152 92.032-91.968 92.032h-78.72zM166.656 309.312a27.968 27.968 0 0 0-27.968 28.032v520c0 15.424 12.544 27.968 27.968 27.968h520a28.032 28.032 0 0 0 28.032-27.968V337.28a28.032 28.032 0 0 0-28.032-28.032H166.656z" p-id="5039"></path>
                </svg>
              )}
            </button>
          )}
        </div>
        <span data-testid="overflow-tooltip-arrow" className={arrowClass} aria-hidden="true" />
      </div>
    </div >,
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
  copyable = false,
}: {
  content: string;
  className?: string;
  textClassName?: string;
  as?: ElementType;
  children?: ReactElement;
  forceShow?: boolean;
  copyable?: boolean;
}) {
  const contentRef = useRef<HTMLElement | null>(null);
  const { triggerRef, tooltipRef, tooltipId, open, setOpen, tooltipStyle, placement } = useTooltipPositioning(content);
  const [copied, setCopied] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }, [clearCloseTimer, setOpen]);

  const handleOpen = () => {
    const node = contentRef.current;
    if (!node) return;
    clearCloseTimer();
    setOpen(forceShow || isOverflowed(node));
  };

  const handleCopy = useCallback(async () => {
    if (!copyable || !content.trim()) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setOpen(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // no-op
    }
  }, [content, copyable, setOpen]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

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
      onMouseOut={() => (copyable ? scheduleClose() : setOpen(false))}
      onFocus={handleOpen}
      onBlur={() => (copyable ? scheduleClose() : setOpen(false))}
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
        copyable={copyable}
        copied={copied}
        onTooltipEnter={clearCloseTimer}
        onTooltipLeave={scheduleClose}
        onCopy={() => void handleCopy()}
      />
    </div>
  );
}
