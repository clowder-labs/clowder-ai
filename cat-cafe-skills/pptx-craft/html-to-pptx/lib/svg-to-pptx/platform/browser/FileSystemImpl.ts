// src/platform/browser/FileSystemImpl.ts
import { FileSystemInterface } from '../FileSystem'

export class BrowserFileSystem implements FileSystemInterface {
  async readFile(_path: string): Promise<Buffer> {
    // 浏览器中无法直接读取本地文件
    throw new Error('File reading is not supported in browser environment')
  }

  async writeFile(_path: string, _data: Buffer): Promise<void> {
    // 浏览器中文件写入通过 Blob API 实现
    throw new Error('Direct file writing is not supported in browser environment. Use downloadBlob() instead.')
  }

  /**
   * 下载 Blob 为文件
   */
  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * 创建临时 Blob URL
   */
  createBlobURL(blob: Blob): string {
    return URL.createObjectURL(blob)
  }

  /**
   * 撤销 Blob URL
   */
  revokeBlobURL(url: string): void {
    URL.revokeObjectURL(url)
  }

  mkdtemp(_prefix: string): string {
    // 浏览器中没有临时目录概念
    return ''
  }

  rmSync(_path: string, _options?: { recursive?: boolean; force?: boolean }): void {
    // 无需清理，由垃圾回收处理
  }
}