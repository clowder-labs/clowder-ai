// src/platform/browser/index.ts
import { PlatformInterfaces } from '../index'
import { BrowserDOMParser } from './DOMParserImpl'
import { BrowserImageGenerator } from './ImageGeneratorImpl'
import { BrowserFileSystem } from './FileSystemImpl'

export function createBrowserPlatform(): PlatformInterfaces {
  return {
    domParser: new BrowserDOMParser(),
    imageGenerator: new BrowserImageGenerator(),
    fileSystem: new BrowserFileSystem()
  }
}

// 导出浏览器专用 API
export { BrowserFileSystem } from './FileSystemImpl'