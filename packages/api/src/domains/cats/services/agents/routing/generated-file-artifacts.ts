/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { RichBlock } from '@clowder/shared';

export type GeneratedFileArtifact = {
  fileName: string;
  url: string;
  workspacePath?: string;
  mimeType?: string;
  source: 'callback' | 'workspace' | 'cli' | 'provider';
};

function parseWorkspacePathFromUrl(url: string): string | undefined {
  if (!url.startsWith('/api/workspace/download?')) return undefined;
  const query = url.split('?')[1];
  if (!query) return undefined;

  const params = new URLSearchParams(query);
  const path = params.get('path');
  return path ?? undefined;
}

function dedupeArtifacts(artifacts: GeneratedFileArtifact[]): GeneratedFileArtifact[] {
  const seen = new Set<string>();
  const deduped: GeneratedFileArtifact[] = [];

  for (const artifact of artifacts) {
    const key = `${artifact.fileName}::${artifact.workspacePath ?? ''}::${artifact.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(artifact);
  }

  return deduped;
}

function resolveArtifactSource(block: Extract<RichBlock, { kind: 'file' }>): GeneratedFileArtifact['source'] {
  if (block.workspacePath || block.url.startsWith('/api/workspace/download?')) return 'workspace';
  if (block.url.startsWith('/uploads/')) return 'callback';
  return 'provider';
}

function  resolveArtifactLocation(artifact: GeneratedFileArtifact): string {
  return artifact.workspacePath ?? artifact.url;
}

function contentHasArtifactDisclosure(content: string, artifact: GeneratedFileArtifact): boolean {
  if (!content.includes(artifact.fileName)) return false;

  const locations = [artifact.workspacePath, parseWorkspacePathFromUrl(artifact.url), artifact.url].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );

  return locations.some((location) => content.includes(location));
}

export function extractGeneratedFileArtifacts(richBlocks: readonly RichBlock[]): GeneratedFileArtifact[] {
  const artifacts = richBlocks
    .filter((block): block is Extract<RichBlock, { kind: 'file' }> => block.kind === 'file' && typeof block.url === 'string')
    .map((block) => ({
      fileName: block.fileName,
      url: block.url,
      workspacePath: block.workspacePath ?? parseWorkspacePathFromUrl(block.url),
      mimeType: block.mimeType,
      source: resolveArtifactSource(block),
    }));

  return dedupeArtifacts(artifacts);
}

export function appendGeneratedFileLocationDisclosure(content: string, richBlocks: readonly RichBlock[]): string {
  const artifacts = extractGeneratedFileArtifacts(richBlocks);
  if (artifacts.length === 0) return content;

  const missingArtifacts = artifacts.filter((artifact) => !contentHasArtifactDisclosure(content, artifact));
  if (missingArtifacts.length === 0) return content;

  const disclosure = missingArtifacts
    .map((artifact) => `- ${artifact.fileName}: ${resolveArtifactLocation(artifact)}`)
    .join('\n');
  const separator = content.trim().length > 0 ? '\n\n' : '';
  return `${content}${separator}文件位置：\n${disclosure}`;
}
