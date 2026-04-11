/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Multipart Request Parser
 * 解析 multipart/form-data 请求，提取文本字段和图片文件。
 * 从 messages.ts 提取，降低文件复杂度。
 */

import type { FileContent, ImageContent, MessageContent, TextContent } from '@cat-cafe/shared';
import type { Multipart } from '@fastify/multipart';
import {
  ImageUploadError,
  saveUploadedAttachments,
  saveUploadedAttachmentsToWorkspace,
  saveUploadedImages,
  saveUploadedImagesToWorkspace,
  type UploadImageFile,
  type WorkspaceUploadTarget,
} from './image-upload.js';
import { sendMessageSchema } from './messages.schema.js';

export type ParsedMultipart =
  | {
      content: string;
      userId?: string;
      threadId?: string;
      idempotencyKey?: string;
      resumeCatId?: string;
      contentBlocks: MessageContent[];
      visibility?: string;
      whisperTo?: string[];
      deliveryMode?: 'immediate' | 'queue' | 'force';
    }
  | { error: string };

/** Parse multipart request into validated message fields + contentBlocks */
export async function parseMultipart(
  request: { parts: () => AsyncIterableIterator<Multipart> },
  uploadDir: string,
  resolveWorkspaceTarget?: (threadId?: string) => Promise<WorkspaceUploadTarget | null>,
): Promise<ParsedMultipart> {
  // F35: Use string | string[] to support multi-value fields like whisperTo
  const fields: Record<string, string | string[]> = {};
  const imageFiles: UploadImageFile[] = [];
  const attachmentFiles: UploadImageFile[] = [];

  for await (const part of request.parts()) {
    if (part.type === 'field' && typeof part.value === 'string') {
      const existing = fields[part.fieldname];
      if (existing !== undefined) {
        // Multi-value field (e.g. whisperTo): collect into array
        fields[part.fieldname] = Array.isArray(existing) ? [...existing, part.value] : [existing, part.value];
      } else {
        fields[part.fieldname] = part.value;
      }
    } else if (part.type === 'file') {
      // IMPORTANT: multipart file streams must be drained during iteration.
      // If we defer `toBuffer()` until after the loop, parser may block waiting
      // for this stream to be consumed and request hangs.
      const buffer = await part.toBuffer();
      const target = part.fieldname === 'images' ? imageFiles : attachmentFiles;
      target.push({
        filename: part.filename,
        mimetype: part.mimetype,
        toBuffer: async () => buffer,
      });
    }
  }

  // F35: Normalize whisperTo — single value becomes array for Zod validation
  if (fields.whisperTo !== undefined && !Array.isArray(fields.whisperTo)) {
    fields.whisperTo = [fields.whisperTo];
  }

  const parseResult = sendMessageSchema.safeParse(fields);
  if (!parseResult.success) {
    return { error: 'Invalid form fields' };
  }

  const { content, userId, threadId, idempotencyKey, resumeCatId } = parseResult.data;
  const blocks: MessageContent[] = [{ type: 'text', text: content } as TextContent];
  const workspaceTarget = resolveWorkspaceTarget ? await resolveWorkspaceTarget(threadId) : null;

  if (imageFiles.length > 0) {
    try {
      const saved = workspaceTarget
        ? await saveUploadedImagesToWorkspace(imageFiles, workspaceTarget)
        : await saveUploadedImages(imageFiles, uploadDir);
      for (const img of saved) {
        blocks.push(img.content as ImageContent);
      }
    } catch (err) {
      if (err instanceof ImageUploadError) {
        return { error: err.message };
      }
      throw err;
    }
  }

  if (attachmentFiles.length > 0) {
    try {
      const saved = workspaceTarget
        ? await saveUploadedAttachmentsToWorkspace(attachmentFiles, workspaceTarget)
        : await saveUploadedAttachments(attachmentFiles, uploadDir);
      for (const file of saved) {
        blocks.push(file.content as FileContent);
      }
    } catch (err) {
      if (err instanceof ImageUploadError) {
        return { error: err.message };
      }
      throw err;
    }
  }

  return {
    content,
    ...(userId ? { userId } : {}),
    ...(threadId ? { threadId } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(resumeCatId ? { resumeCatId } : {}),
    ...(parseResult.data.visibility ? { visibility: parseResult.data.visibility } : {}),
    ...(parseResult.data.whisperTo ? { whisperTo: parseResult.data.whisperTo as string[] } : {}),
    ...(parseResult.data.deliveryMode ? { deliveryMode: parseResult.data.deliveryMode } : {}),
    contentBlocks: blocks,
  };
}
