/**
 * Image Path Extraction
 * Extracts absolute file paths from MessageContent blocks for CLI passthrough.
 */

import { isAbsolute, relative, resolve } from 'node:path';
import type { MessageContent } from '@cat-cafe/shared';
import { getRegisteredWorktreeRoot } from '../../../../workspace/workspace-security.js';

const DEFAULT_UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads';

/**
 * Extract absolute image file paths from contentBlocks.
 * Converts relative URL paths (/uploads/foo.png) to absolute filesystem paths.
 * @param uploadDir Override for the upload directory (defaults to UPLOAD_DIR env or './uploads')
 */
export function extractImagePaths(contentBlocks: readonly MessageContent[] | undefined, uploadDir?: string): string[] {
  if (!contentBlocks) return [];

  const paths: string[] = [];
  for (const block of contentBlocks) {
    if (block.type !== 'image') continue;
    const url = block.url;
    if (url.startsWith('/uploads/')) {
      const filename = url.slice('/uploads/'.length);
      paths.push(resolve(uploadDir ?? DEFAULT_UPLOAD_DIR, filename));
    } else if (url.startsWith('/api/workspace/file/raw?')) {
      const workspacePath = resolveWorkspaceImagePath(url);
      if (workspacePath) paths.push(workspacePath);
    } else if (url.startsWith('/')) {
      paths.push(resolve(url));
    }
  }
  return paths;
}

function resolveWorkspaceImagePath(url: string): string | null {
  const query = url.split('?')[1];
  if (!query) return null;

  const params = new URLSearchParams(query);
  const worktreeId = params.get('worktreeId');
  const filePath = params.get('path');
  if (!worktreeId || !filePath) return null;

  const root = getRegisteredWorktreeRoot(worktreeId);
  if (!root) return null;

  const resolved = resolve(root, filePath);
  const relativeToRoot = relative(root, resolved);
  if (relativeToRoot.startsWith('..') || isAbsolute(relativeToRoot)) return null;
  return resolved;
}
