/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useRef, useState } from 'react';

export function WechatGroupInvite() {
  const [showPopover, setShowPopover] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPopover) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      setShowPopover(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showPopover]);

  return (
    <div ref={containerRef} className="relative px-4 mx-4 mb-[12px] rounded-[8px]" style={{ background: 'var(--menu-hover-bg)' }}>
      <div
        ref={triggerRef}
        className="relative flex items-center gap-2 h-[44px] cursor-pointer transition-colors group"
        onMouseEnter={() => setShowPopover(true)}
        onMouseLeave={() => setShowPopover(false)}
        data-testid="wechat-group-invite"
      >
        <img src="/images/connectors/weixin.svg" alt="" className="w-[24px] h-[24px] shrink-0 relative z-10" />
        <span className="text-[14px] font-normal text-[var(--text-primary)] truncate relative z-10">扫码加入体验官交流群</span>
        {showPopover && (
          <div
            ref={popoverRef}
            className="ui-overlay-card absolute left-[-12px] right-[-12px] bottom-[calc(100%+12px)] z-50"
            onMouseEnter={() => setShowPopover(true)}
            onMouseLeave={() => setShowPopover(false)}
            data-testid="wechat-group-qr-popover"
          >
            <div className="p-4 flex items-center justify-center rounded-[inherit]" style={{ aspectRatio: '1/1' }}>
              <img src="https://openjiuwen-ci.obs.cn-north-4.myhuaweicloud.com/office-claw/image/wechat-officeclaw.jpg" alt="微信交流群二维码" className="w-full h-full object-contain" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}