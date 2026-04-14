/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

"use client";

import { useState } from 'react';
import { ChatContainer } from '@/components/ChatContainer';

export default function ThreadPage({ params }: { params: { threadId: string } }) {
  // If this component is rendered on the client (client-side navigation),
  // we disable the initial full-page auth check to avoid a flash of the
  // global AuthLoadingPanel. Direct (server) navigations should still
  // perform the login check.
  const [isClient] = useState(() => typeof window !== 'undefined');

  return <ChatContainer mode="thread" threadId={params.threadId} requireLoginCheck={!isClient} />;
}
