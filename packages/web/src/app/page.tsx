/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { ChatContainer } from '@/components/ChatContainer';

export default function Home({
  searchParams,
}: {
  searchParams?: { authSuccess?: string | string[] };
}) {
  const authSuccess = Array.isArray(searchParams?.authSuccess) ? searchParams?.authSuccess[0] : searchParams?.authSuccess;

  return <ChatContainer mode="new" requireLoginCheck skipInitialAuthGate={authSuccess === '1'} />;
}
