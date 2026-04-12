import type { SVGElementNode, ConverterConfig, ConversionResult } from '../types'
import { SVGParser } from './SVGParser'
import { PPTXBuilder } from './PPTXBuilder'
import { CoordinateMapper } from '../utils/CoordinateMapper'
import { GroupConverter } from '../converters/GroupConverter'
import { GradientImageGenerator } from '../utils/GradientImageGenerator'
import type { PlatformInterfaces } from '../platform'

export type { ConverterConfig, ConversionResult }

// 延迟导入 Node.js 平台实现（避免在浏览器环境或测试中加载 jsdom）
function getNodePlatformCreator(): () => PlatformInterfaces {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../platform/node').createNodePlatform
}

export class Converter {
  private config: {
    pxToInch: number
    slideWidth: number | 'auto'
    slideHeight: number | 'auto'
  }
  private mapper: CoordinateMapper
  private pptxBuilder: PPTXBuilder
  private groupConverter: GroupConverter
  private gradientGenerator: GradientImageGenerator
  private platform: PlatformInterfaces

  constructor(config: ConverterConfig = {}, platform?: PlatformInterfaces) {
    this.config = {
      pxToInch: config.pxToInch || 96,
      slideWidth: config.slideWidth || 'auto',
      slideHeight: config.slideHeight || 'auto'
    }

    // 使用提供的平台实现或创建默认 Node.js 平台（延迟导入）
    if (platform) {
      this.platform = platform
    } else {
      // 通过检测 globalThis.process 来判断是否为 Node.js 环境
      // jsdom 测试环境虽有 window/document，但无 Node.js 的 process 对象
      const isNode = typeof process !== 'undefined' && process.versions?.node
      if (isNode) {
        this.platform = getNodePlatformCreator()()
      } else {
        // 浏览器环境请使用 BrowserConverter
        throw new Error('Browser environment detected. Use BrowserConverter instead.')
      }
    }

    this.mapper = new CoordinateMapper(this.config.pxToInch)
    this.pptxBuilder = new PPTXBuilder()
    this.groupConverter = new GroupConverter()
    this.gradientGenerator = new GradientImageGenerator(this.platform.imageGenerator)
  }

  /**
   * 将 SVG 字符串转换为 PPTX 对象数组（不写入 PPTX）
   * 用于外部集成场景
   */
  async convertToObjects(svgString: string): Promise<{
    objects: Record<string, any>[]
    dimensions: { width: number; height: number }
  }> {
    // 1. 解析 SVG（使用注入的平台 DOMParser）
    const svgParser = new SVGParser(this.platform.domParser)
    const { root: svgTree, gradients } = svgParser.parse(svgString)
    if (!svgTree) {
      throw new Error('Failed to parse SVG string')
    }

    // 传递渐变定义和生成器到转换器
    this.groupConverter.setGradients(gradients)
    this.groupConverter.setGradientGenerator(this.gradientGenerator)

    // 2. 获取 SVG 尺寸
    const width = parseFloat(svgTree.attributes.width || svgTree.attributes.viewBox?.split(' ')[2] || '800')
    const height = parseFloat(svgTree.attributes.height || svgTree.attributes.viewBox?.split(' ')[3] || '600')

    const slideWidth = this.config.slideWidth === 'auto'
      ? this.mapper.pxToInch(width)
      : this.config.slideWidth

    const slideHeight = this.config.slideHeight === 'auto'
      ? this.mapper.pxToInch(height)
      : this.config.slideHeight

    // 3. 转换 SVG 元素树
    const objects = await this.convertElementTree(svgTree, this.mapper)

    return {
      objects,
      dimensions: { width: slideWidth, height: slideHeight }
    }
  }

  /**
   * 将 SVG 字符串转换为 PPTX
   */
  async convert(svgString: string): Promise<ConversionResult> {
    const { objects, dimensions } = await this.convertToObjects(svgString)

    // 创建 PPTX
    const pptx = this.pptxBuilder.createPresentation()
    const slide = this.pptxBuilder.addSlide(pptx, dimensions)

    // 添加到幻灯片
    this.pptxBuilder.addObjects(slide, objects)

    return { pptx, slide }
  }

  /**
   * 递归转换 SVG 元素树
   */
  private async convertElementTree(element: SVGElementNode, mapper: CoordinateMapper): Promise<Record<string, any>[]> {
    return await this.groupConverter.convertElement(element, mapper) as Record<string, any>[]
  }
}
