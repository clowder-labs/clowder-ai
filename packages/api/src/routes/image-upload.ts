/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Image Upload Utilities
 * Handles multipart file saving and validation for image uploads.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import type { FileContent, ImageContent } from '@clowder/shared';
import { resolveWorkspacePath } from '../domains/workspace/workspace-security.js';

const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const ALLOWED_ATTACHMENT_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const MAX_ATTACHMENT_BASE_LENGTH = 120;
const MAX_UNIQUE_NAME_ATTEMPTS = 1000;
const WINDOWS_RESERVED_BASENAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export interface SavedImage {
  absPath: string;
  urlPath: string;
  content: ImageContent;
}

export interface SavedAttachment {
  absPath: string;
  urlPath: string;
  content: FileContent;
}

export interface UploadImageFile {
  filename?: string;
  mimetype: string;
  toBuffer: () => Promise<Buffer>;
}

export interface WorkspaceUploadTarget {
  kind: 'workspace';
  worktreeId: string;
  workspaceRoot: string;
  directoryPath: string;
}

/**
 * Validate and save uploaded image files.
 * Returns saved image metadata for contentBlocks and CLI passthrough.
 */
export async function saveUploadedImages(files: UploadImageFile[], uploadDir: string): Promise<SavedImage[]> {
  if (files.length > MAX_FILES) {
    throw new ImageUploadError(`Too many files (max ${MAX_FILES})`);
  }

  await mkdir(uploadDir, { recursive: true });

  const saved: SavedImage[] = [];
  for (const file of files) {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      throw new ImageUploadError(`Unsupported file type: ${file.mimetype}`);
    }

    const buffer = await file.toBuffer();
    if (buffer.byteLength > MAX_FILE_SIZE) {
      throw new ImageUploadError(`File too large: ${buffer.byteLength} bytes (max ${MAX_FILE_SIZE})`);
    }

    // SECURITY: derive extension from validated MIME only, never trust filename
    const ext = mimeToExt(file.mimetype);
    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
    const absPath = resolve(join(uploadDir, filename));

    await writeFile(absPath, buffer);

    saved.push({
      absPath,
      urlPath: `/uploads/${filename}`,
      content: { type: 'image', url: `/uploads/${filename}` },
    });
  }

  return saved;
}

export async function saveUploadedImagesToWorkspace(
  files: UploadImageFile[],
  target: WorkspaceUploadTarget,
): Promise<SavedImage[]> {
  if (files.length > MAX_FILES) {
    throw new ImageUploadError(`Too many files (max ${MAX_FILES})`);
  }

  const saved: SavedImage[] = [];
  for (const file of files) {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      throw new ImageUploadError(`Unsupported file type: ${file.mimetype}`);
    }

    const buffer = await file.toBuffer();
    if (buffer.byteLength > MAX_FILE_SIZE) {
      throw new ImageUploadError(`File too large: ${buffer.byteLength} bytes (max ${MAX_FILE_SIZE})`);
    }

    const ext = mimeToExt(file.mimetype);
    const diskName = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
    const workspacePath = toWorkspaceChildPath(target.directoryPath, diskName);
    const absPath = await resolveWorkspacePath(target.workspaceRoot, workspacePath);

    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, buffer);

    const query = new URLSearchParams({
      worktreeId: target.worktreeId,
      path: workspacePath,
    }).toString();
    const urlPath = `/api/workspace/file/raw?${query}`;

    saved.push({
      absPath,
      urlPath,
      content: { type: 'image', url: urlPath },
    });
  }

  return saved;
}

/**
 * Validate and save uploaded attachment files.
 * Returns saved metadata for contentBlocks.
 */
export async function saveUploadedAttachments(
  files: UploadImageFile[],
  uploadDir: string,
): Promise<SavedAttachment[]> {
  if (files.length > MAX_FILES) {
    throw new ImageUploadError(`Too many files (max ${MAX_FILES})`);
  }

  await mkdir(uploadDir, { recursive: true });

  const saved: SavedAttachment[] = [];
  for (const file of files) {
    if (!ALLOWED_ATTACHMENT_MIMES.has(file.mimetype)) {
      throw new ImageUploadError(`Unsupported file type: ${file.mimetype}`);
    }

    const buffer = await file.toBuffer();
    if (buffer.byteLength > MAX_FILE_SIZE) {
      throw new ImageUploadError(`File too large: ${buffer.byteLength} bytes (max ${MAX_FILE_SIZE})`);
    }

    const originalFileName = sanitizeAttachmentName(file.filename, file.mimetype);
    const { filename, absPath } = await writeUniqueUploadFile(uploadDir, originalFileName, buffer);
    const urlPath = buildUploadUrlPath(filename);

    saved.push({
      absPath,
      urlPath,
      content: {
        type: 'file',
        url: urlPath,
        fileName: originalFileName,
        mimeType: file.mimetype,
        fileSize: buffer.byteLength,
      },
    });
  }

  return saved;
}

export async function saveUploadedAttachmentsToWorkspace(
  files: UploadImageFile[],
  target: WorkspaceUploadTarget,
): Promise<SavedAttachment[]> {
  if (files.length > MAX_FILES) {
    throw new ImageUploadError(`Too many files (max ${MAX_FILES})`);
  }

  const saved: SavedAttachment[] = [];
  for (const file of files) {
    if (!ALLOWED_ATTACHMENT_MIMES.has(file.mimetype)) {
      throw new ImageUploadError(`Unsupported file type: ${file.mimetype}`);
    }

    const buffer = await file.toBuffer();
    if (buffer.byteLength > MAX_FILE_SIZE) {
      throw new ImageUploadError(`File too large: ${buffer.byteLength} bytes (max ${MAX_FILE_SIZE})`);
    }

    const originalFileName = sanitizeAttachmentName(file.filename, file.mimetype);
    const { filename, absPath, workspacePath } = await writeUniqueWorkspaceUploadFile(target, originalFileName, buffer);

    const query = new URLSearchParams({
      worktreeId: target.worktreeId,
      path: workspacePath,
    }).toString();
    const urlPath = `/api/workspace/download?${query}`;

    saved.push({
      absPath,
      urlPath,
      content: {
        type: 'file',
        url: urlPath,
        fileName: originalFileName,
        mimeType: file.mimetype,
        fileSize: buffer.byteLength,
      },
    });
  }

  return saved;
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    default:
      return '.bin';
  }
}

function buildUploadUrlPath(filename: string): string {
  return `/uploads/${encodeURIComponent(filename)}`;
}

function splitFileName(filename: string): { base: string; ext: string } {
  const ext = extname(filename);
  return ext ? { base: filename.slice(0, -ext.length), ext } : { base: filename, ext: '' };
}

function buildDuplicateName(filename: string, index: number): string {
  const { base, ext } = splitFileName(filename);
  return `${base} (${index})${ext}`;
}

async function writeUniqueUploadFile(
  uploadDir: string,
  preferredName: string,
  buffer: Buffer,
): Promise<{ filename: string; absPath: string }> {
  for (let index = 0; index < MAX_UNIQUE_NAME_ATTEMPTS; index += 1) {
    const filename = index === 0 ? preferredName : buildDuplicateName(preferredName, index);
    const absPath = resolve(join(uploadDir, filename));
    try {
      await writeFile(absPath, buffer, { flag: 'wx' });
      return { filename, absPath };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw error;
    }
  }

  throw new ImageUploadError('Unable to allocate a unique attachment filename');
}

async function writeUniqueWorkspaceUploadFile(
  target: WorkspaceUploadTarget,
  preferredName: string,
  buffer: Buffer,
): Promise<{ filename: string; absPath: string; workspacePath: string }> {
  for (let index = 0; index < MAX_UNIQUE_NAME_ATTEMPTS; index += 1) {
    const filename = index === 0 ? preferredName : buildDuplicateName(preferredName, index);
    const workspacePath = toWorkspaceChildPath(target.directoryPath, filename);
    const absPath = await resolveWorkspacePath(target.workspaceRoot, workspacePath);

    try {
      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, buffer, { flag: 'wx' });
      return { filename, absPath, workspacePath };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw error;
    }
  }

  throw new ImageUploadError('Unable to allocate a unique attachment filename');
}

function attachmentMimeToExt(mime: string): string {
  switch (mime) {
    case 'application/pdf':
      return '.pdf';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return '.docx';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return '.xlsx';
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return '.pptx';
    case 'text/plain':
      return '.txt';
    case 'text/csv':
      return '.csv';
    default:
      return '.bin';
  }
}

function sanitizeAttachmentName(filename: string | undefined, mime: string): string {
  const raw = basename(filename ?? '').trim();
  const fallback = `attachment${attachmentMimeToExt(mime)}`;
  if (!raw) return fallback;

  const cleaned = raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  if (!cleaned) return fallback;

  const base = extname(cleaned) ? cleaned.slice(0, -extname(cleaned).length) : cleaned;
  const normalizedBase = base.replace(/[. ]+$/g, '').trim();
  let safeBase = normalizedBase || 'attachment';
  if (safeBase.length > MAX_ATTACHMENT_BASE_LENGTH) {
    safeBase = safeBase.slice(0, MAX_ATTACHMENT_BASE_LENGTH).trim();
  }
  if (!safeBase) safeBase = 'attachment';
  if (WINDOWS_RESERVED_BASENAME_RE.test(safeBase)) {
    safeBase = `_${safeBase}`;
  }
  return `${safeBase}${attachmentMimeToExt(mime)}`;
}

function toWorkspaceChildPath(directoryPath: string, filename: string): string {
  const trimmed = directoryPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return trimmed ? `${trimmed}/${filename}` : filename;
}

export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageUploadError';
  }
}
