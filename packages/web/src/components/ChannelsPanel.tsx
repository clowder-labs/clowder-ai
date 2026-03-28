'use client';

import { HubConnectorConfigTab } from './HubConnectorConfigTab';

export function ChannelsPanel() {
  return (
    <div className="ui-page-shell">
      <div className="ui-page-header">
        <h1 className="ui-page-title">渠道管理</h1>
        <p className="ui-page-subtitle">集成外部消息通道，统一管理消息收发与接入配置。</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <HubConnectorConfigTab />
      </div>
    </div>
  );
}
