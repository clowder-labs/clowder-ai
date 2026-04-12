// src/platform/FileSystem.ts

export interface FileSystemInterface {
  // 读取文件
  readFile(path: string): Promise<Buffer>
  // 写入文件
  writeFile(path: string, data: Buffer): Promise<void>
  // 创建临时目录
  mkdtemp(prefix: string): string
  // 删除目录或文件
  rmSync(path: string, options?: { recursive: boolean; force: boolean }): void
}