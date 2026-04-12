// src/index.browser.ts
// 浏览器端入口文件
import { createBrowserPlatform } from './platform/browser'
import { Converter } from './core/Converter'

// 创建浏览器平台实现
const platform = createBrowserPlatform()

// 导出浏览器版 Converter
export class BrowserConverter extends Converter {
  constructor(config?: ConstructorParameters<typeof Converter>[0]) {
    super(config, platform)
  }
}

// 便捷函数
export async function convertSVGToPPTX(
  svgString: string,
  config?: ConstructorParameters<typeof Converter>[0]
): Promise<Blob> {
  const converter = new BrowserConverter(config)
  const result = await converter.convert(svgString)

  // 生成 Blob
  return await result.pptx.write({ outputType: 'blob' })
}

export type { ConverterConfig, ConversionResult } from './core/Converter'
export type { SVGElementNode, ColorRGBA, TransformMatrix, Point } from './types'
