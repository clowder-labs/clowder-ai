import { SVGElementNode, Gradient } from '../types'
import { CoordinateMapper } from '../utils/CoordinateMapper'
import { ColorParser } from '../utils/ColorParser'
import { GradientConverter } from './GradientConverter'

/**
 * 元素转换器基类
 * 每个具体元素类型继承此类并实现 convertElement 方法
 */
export abstract class ElementConverter {
  protected gradients?: Map<string, Gradient>
  protected gradientConverter?: GradientConverter

  /**
   * 设置渐变定义映射表
   */
  setGradients(gradients: Map<string, Gradient>): void {
    this.gradients = gradients
  }

  /**
   * 设置渐变转换器
   */
  setGradientConverter(converter: GradientConverter): void {
    this.gradientConverter = converter
  }

  /**
   * 检测元素是否使用了渐变填充
   */
  protected hasGradientFill(element: SVGElementNode): boolean {
    const fillAttr = element.attributes.fill || element.style.fill || ''
    if (!fillAttr.startsWith('url(')) return false
    const gradientId = fillAttr.match(/url\(#([^)]+)\)/)?.[1]
    return !!gradientId && !!this.gradients?.has(gradientId)
  }

  /**
   * 提取元素渐变填充的 gradientId
   * @returns gradientId 或 undefined
   */
  protected getGradientId(element: SVGElementNode): string | undefined {
    const fillAttr = element.attributes.fill || element.style.fill || ''
    if (!fillAttr.startsWith('url(')) return undefined
    return fillAttr.match(/url\(#([^)]+)\)/)?.[1]
  }

  /**
   * 将单个 SVG 元素转换为 PPTX 对象数组
   */
  abstract convertElement(
    element: SVGElementNode,
    mapper: CoordinateMapper
  ): any[] | Promise<any[]>

  /**
   * 从 SVG 元素提取 PPTX 填充选项
   */
  protected getPptxFillOptions(
    element: SVGElementNode,
    mapper: CoordinateMapper
  ): Record<string, any> {
    const fillAttr = element.attributes.fill || element.style.fill || ''
    const fillOpacity = element.attributes['fill-opacity'] || element.style.fillOpacity
    const opacity = element.attributes.opacity || element.style.opacity

    // 跳过无填充的元素（none、transparent 或 fill-opacity="0"）
    if (fillAttr === 'none' || fillAttr === 'transparent' || fillOpacity === '0') {
      return {}
    }

    const options: Record<string, any> = {}

    // 处理透明度（fill-opacity 优先，其次 opacity）
    let transparency: number | undefined
    if (fillOpacity !== undefined && fillOpacity !== '') {
      transparency = (1 - parseFloat(String(fillOpacity))) * 100
    } else if (opacity !== undefined && opacity !== '') {
      transparency = (1 - parseFloat(String(opacity))) * 100
    }

    // 处理 url() 引用的渐变
    if (fillAttr.startsWith('url(')) {
      const gradientId = fillAttr.match(/url\(#([^)]+)\)/)?.[1]
      if (gradientId && this.gradients?.has(gradientId)) {
        // 返回渐变引用标记，由具体形状转换器处理
        options.fill = { type: 'gradient-ref', gradientId }
        return options
      }
      return options
    }

    const fillResult = ColorParser.parseFill(fillAttr)

    if (fillResult && fillResult.type === 'solid') {
      // 合并 rgba 中的 alpha 通道与 fill-opacity/opacity 属性
      let finalTransparency = transparency
      if (fillResult.color.a !== undefined && fillResult.color.a !== 1) {
        const rgbaTransparency = (1 - fillResult.color.a) * 100
        // 如果有 fill-opacity/opacity，则叠加透明度；否则直接使用 rgba 的透明度
        if (finalTransparency !== undefined) {
          // 叠加透明度：例如 rgba 50% 透明 + fill-opacity 50% = 75% 透明
          finalTransparency = 100 - (100 - rgbaTransparency) * (100 - finalTransparency) / 100
        } else {
          finalTransparency = rgbaTransparency
        }
      }

      options.fill = {
        type: 'solid',
        color: ColorParser.colorToPptxHex(fillResult.color),
        ...(finalTransparency !== undefined ? { transparency: finalTransparency } : {})
      }
    }

    return options
  }

  /**
   * 从 SVG 元素提取 PPTX 线条选项
   */
  protected getPptxLineOptions(
    element: SVGElementNode,
    mapper: CoordinateMapper
  ): Record<string, any> {
    const stroke = element.attributes.stroke || element.style.stroke || ''
    const strokeValue = element.attributes['stroke-width'] || element.style.strokeWidth
    const strokeWidth = parseFloat(strokeValue !== undefined ? String(strokeValue) : '1')

    // 跳过 stroke-width="0" 的元素（不可见描边）
    if (strokeWidth === 0) {
      return {}
    }

    const options: Record<string, any> = {}

    const colorResult = ColorParser.parseColor(stroke)
    if (colorResult) {
      // PptxGenJS line.width 使用 points
      // 经验值：SVG px 到 PPTX pt 的转换系数约为 0.75（即 4px ≈ 3pt）
      // 但为了视觉效果匹配，我们使用 0.5 作为转换系数（4px ≈ 2pt）
      const lineWidth = Math.max(strokeWidth * 0.5, 0.5)
      options.line = {
        color: ColorParser.colorToPptxHex(colorResult),
        width: lineWidth
      }
    }

    // 处理 marker-end 箭头标记
    const markerEnd = element.attributes['marker-end']
    if (markerEnd && markerEnd.includes('url(')) {
      // SVG marker-end 对应 PptxGenJS 的 lineTail（线条终点箭头）
      options.lineTail = 'arrow'
    }

    // 处理 marker-start 箭头标记
    const markerStart = element.attributes['marker-start']
    if (markerStart && markerStart.includes('url(')) {
      // SVG marker-start 对应 PptxGenJS 的 lineHead（线条起点箭头）
      options.lineHead = 'arrow'
    }

    return options
  }
}
