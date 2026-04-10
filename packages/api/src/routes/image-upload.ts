/**
 * Image Upload Utilities
 * Handles multipart file saving and validation for image uploads.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import type { FileContent, ImageContent } from '@cat-cafe/shared';
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
    const ext = attachmentMimeToExt(file.mimetype);
    const filename = `file-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
    const absPath = resolve(join(uploadDir, filename));

    await writeFile(absPath, buffer);

    saved.push({
      absPath,
      urlPath: `/uploads/${filename}`,
      content: {
        type: 'file',
        url: `/uploads/${filename}`,
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
    const ext = attachmentMimeToExt(file.mimetype);
    const diskName = `file-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
    const workspacePath = toWorkspaceChildPath(target.directoryPath, diskName);
    const absPath = await resolveWorkspacePath(target.workspaceRoot, workspacePath);

    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, buffer);

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
  const safeBase = base.trim() || 'attachment';
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
