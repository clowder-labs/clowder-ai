// src/index.ts
import { Converter, ConverterConfig, ConversionResult } from './core/Converter'
import { SVGElementNode, ColorRGBA, TransformMatrix, Point } from './types'

// 主导出
export { Converter as SVGToPPTXConverter }
export type { ConverterConfig, ConversionResult }

// 类型导出
export type { SVGElementNode, ColorRGBA, TransformMatrix, Point }
