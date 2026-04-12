// src/platform/node/FileSystemImpl.ts
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { FileSystemInterface } from '../FileSystem'

export class NodeFileSystem implements FileSystemInterface {
  async readFile(filePath: string): Promise<Buffer> {
    return fs.promises.readFile(filePath)
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    await fs.promises.writeFile(filePath, data)
  }

  mkdtemp(prefix: string): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  }

  rmSync(p: string, options?: { recursive?: boolean; force?: boolean }): void {
    fs.rmSync(p, { recursive: options?.recursive ?? true, force: options?.force ?? true })
  }
}