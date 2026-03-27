'use client';

import { HubConnectorConfigTab } from './HubConnectorConfigTab';

export function ChannelsPanel() {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h1 className="mb-1 text-[20px] font-bold leading-[30px] text-gray-900">渠道管理</h1>
        <p className="text-sm text-gray-500">集成外部消息通道，实现消息的收发</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <HubConnectorConfigTab />
      </div>
    </div>
  );
}
