'use client';

import { HubConnectorConfigTab } from './HubConnectorConfigTab';

export function ChannelsPanel() {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">渠道管理</h1>
        <p className="text-sm text-gray-500">集成外部消息通道，实现消息的收发</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <HubConnectorConfigTab />
      </div>
    </div>
  );
}
