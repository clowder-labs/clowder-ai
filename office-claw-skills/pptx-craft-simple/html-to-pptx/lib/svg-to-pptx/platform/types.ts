// src/platform/types.ts

// DOM 解析结果
export interface DOMNode {
  tagName: string
  attributes: Record<string, string>
  children: DOMNode[]
  textContent?: string
  getAttribute(name: string): string | null
  hasAttribute(name: string): boolean
  querySelectorAll(selector: string): DOMNode[]
}

export interface DOMDocument {
  documentElement: DOMNode
  querySelector(selector: string): DOMNode | null
}

// 图片数据
export interface ImageData {
  data: Uint8ClampedArray | Buffer
  width: number
  height: number
  channels: number
}

// 平台环境标识
export type Platform = 'node' | 'browser'

// 平台配置
export interface PlatformConfig {
  platform: Platform
}