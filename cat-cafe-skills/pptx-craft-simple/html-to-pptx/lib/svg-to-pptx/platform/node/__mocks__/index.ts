// Jest auto-mock for src/platform/node
// 当在 Jest 环境中时，会自动使用此 mock 替代真实的 platform/node

import { DOMParserInterface } from '../../DOMParser'
import { ImageGeneratorInterface } from '../../ImageGenerator'
import { FileSystemInterface } from '../../FileSystem'
import { PlatformInterfaces } from '../../index'

// 简单的 mock DOMParser 实现（使用原生 DOMParser）
const mockDOMParser = {
  parseFromString(svgString: string): any {
    const parser = new DOMParser()
    const doc = parser.parseFromString(svgString, 'image/svg+xml')

    const wrapNode = (element: Element): any => ({
      tagName: element.tagName.toLowerCase(),
      attributes: (() => {
        const attrs: Record<string, string> = {}
        for (const attr of Array.from(element.attributes)) {
          attrs[attr.name] = attr.value
        }
        return attrs
      })(),
      children: Array.from(element.children).map(wrapNode),
      textContent: element.textContent || undefined,
      getAttribute(name: string): string | null {
        return element.getAttribute(name)
      },
      hasAttribute(name: string): boolean {
        return element.hasAttribute(name)
      },
      querySelectorAll(selector: string): any[] {
        return Array.from(element.querySelectorAll(selector)).map(wrapNode)
      }
    })

    return {
      documentElement: wrapNode(doc.documentElement),
      querySelector(selector: string) {
        const el = doc.querySelector(selector)
        return el ? wrapNode(el) : null
      }
    }
  }
}

const mockImageGenerator = {
  async generateGradientImage(_gradient: any, _width: number, _height: number, _gradientId: string): Promise<string> {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  },
  cleanup(): void {}
}

const mockFileSystem = {
  async readFile(_path: string): Promise<Buffer> {
    throw new Error('Not implemented in mock')
  },
  async writeFile(_path: string, _data: Buffer): Promise<void> {},
  mkdtemp(_prefix: string): string { return '' },
  rmSync(_path: string, _options?: { recursive?: boolean; force?: boolean }): void {}
}

export function createNodePlatform(): PlatformInterfaces {
  return {
    domParser: mockDOMParser as any,
    imageGenerator: mockImageGenerator as any,
    fileSystem: mockFileSystem as any
  }
}
