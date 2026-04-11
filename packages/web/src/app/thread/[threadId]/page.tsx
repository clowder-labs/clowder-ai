/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { ChatContainer } from '@/components/ChatContainer';

export default function ThreadPage({ params }: { params: { threadId: string } }) {
  return <ChatContainer mode="thread" threadId={params.threadId} requireLoginCheck/>;
}
