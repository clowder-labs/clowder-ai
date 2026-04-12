import { SVGElementNode, Gradient } from '../types'
import { CoordinateMapper } from '../utils/CoordinateMapper'
import { ColorParser } from '../utils/ColorParser'
import { GradientImageGenerator } from '../utils/GradientImageGenerator'

/**
 * 元素转换器基类
 * 每个具体元素类型继承此类并实现 convertElement 方法
 */
export abstract class ElementConverter {
  protected gradients?: Map<string, Gradient>
  protected gradientGenerator?: GradientImageGenerator

  /**
   * 设置渐变定义映射表
   */
  setGradients(gradients: Map<string, Gradient>): void {
    this.gradients = gradients
  }

  /**
   * 设置渐变图片生成器
   */
  setGradientGenerator(generator: GradientImageGenerator): void {
    this.gradientGenerator = generator
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
        const gradient = this.gradients.get(gradientId)!
        // PptxGenJS 不支持渐变，使用第一个停止点的颜色作为回退
        const firstStop = gradient.stops[0]
        if (firstStop) {
          options.fill = {
            type: 'solid',
            color: ColorParser.colorToPptxHex(firstStop.color),
            ...(transparency !== undefined ? { transparency } : {})
          }
        }
      }
      return options
    }

    const fillResult = ColorParser.parseFill(fillAttr)

    if (fillResult && fillResult.type === 'solid') {
      options.fill = {
        type: 'solid',
        color: ColorParser.colorToPptxHex(fillResult.color),
        ...(transparency !== undefined ? { transparency } : {})
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

    return options
  }
}
