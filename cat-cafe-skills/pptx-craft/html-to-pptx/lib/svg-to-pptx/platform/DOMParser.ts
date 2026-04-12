// src/platform/DOMParser.ts
import { DOMDocument } from './types'

export interface DOMParserInterface {
  parseFromString(svgString: string): DOMDocument
}

export abstract class DOMParser {
  abstract parse(svgString: string): DOMDocument
}