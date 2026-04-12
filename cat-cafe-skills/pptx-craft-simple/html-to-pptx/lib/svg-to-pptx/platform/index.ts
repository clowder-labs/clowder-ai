// src/platform/index.ts
import { PlatformConfig, Platform } from './types'
import { DOMParserInterface } from './DOMParser'
import { ImageGeneratorInterface } from './ImageGenerator'
import { FileSystemInterface } from './FileSystem'

export interface PlatformInterfaces {
  domParser: DOMParserInterface
  imageGenerator: ImageGeneratorInterface
  fileSystem: FileSystemInterface
}

// 根据环境自动选择平台实现
// 注意：平台具体实现将在 Task 2 和 Task 3 中完成
export function createPlatform(config?: PlatformConfig): PlatformInterfaces | null {
  const platform = config?.platform || detectPlatform()
  // 目前返回 null，后续会通过动态导入获取真实平台实现
  console.warn('Platform implementation pending. Use createNodePlatform() or createBrowserPlatform() directly.')
  return null! as PlatformInterfaces
}

// 自动检测运行环境
function detectPlatform(): Platform {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'browser'
  }
  return 'node'
}

export { DOMParserInterface } from './DOMParser'
export { ImageGeneratorInterface } from './ImageGenerator'
export { FileSystemInterface } from './FileSystem'