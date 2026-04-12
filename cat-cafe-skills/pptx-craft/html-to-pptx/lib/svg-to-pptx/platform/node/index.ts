// src/platform/node/index.ts
import { PlatformInterfaces } from '../index'
import { NodeDOMParser } from './DOMParserImpl'
import { NodeImageGenerator } from './ImageGeneratorImpl'
import { NodeFileSystem } from './FileSystemImpl'

export function createNodePlatform(): PlatformInterfaces {
  return {
    domParser: new NodeDOMParser(),
    imageGenerator: new NodeImageGenerator(),
    fileSystem: new NodeFileSystem()
  }
}