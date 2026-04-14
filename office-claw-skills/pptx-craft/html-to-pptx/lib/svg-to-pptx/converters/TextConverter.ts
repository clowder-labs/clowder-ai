import { SVGElementNode } from '../types'
import { ColorParser } from '../utils/ColorParser'
import { CoordinateMapper } from '../utils/CoordinateMapper'
import { TransformParser } from '../utils/TransformParser'
import { ElementConverter } from './ElementConverter'

/**
 * 文本元素转换器
 * 将 SVG <text> 元素转换为 PPTX 文本对象
 */
export class TextConverter extends ElementConverter {
  /**
   * 将 SVG 文本元素转换为 PPTX 文本对象
   */
  convertElement(
    element: SVGElementNode,
    mapper: CoordinateMapper
  ): any[] {
    // 解析 x, y 坐标（可能为 undefined）
    const xAttr = element.attributes.x
    const yAttr = element.attributes.y
    const x = xAttr !== undefined ? parseFloat(xAttr) : 0
    const y = yAttr !== undefined ? parseFloat(yAttr) : 0
    const fontSize = parseFloat(
      element.attributes['font-size'] ||
      String(element.style['font-size'] || element.style.fontSize || '12')
    )
    const fontFamily = this.resolveFontFamily(
      element.attributes['font-family'] || element.style.fontFamily || ''
    )
    const fontWeight = element.attributes['font-weight'] ||
      (element.style.fontWeight !== undefined ? String(element.style.fontWeight) : '') ||
      'normal'
    const textAnchor = element.attributes['text-anchor'] || element.style.textAlign || 'start'

    // 解析变换并用完整矩阵变换文本位置
    const transform = TransformParser.parseTransform(element.attributes.transform || '')
    const transformedPos = TransformParser.applyTransformToPoint(transform, { x, y })
    const mappedX = mapper.pxToInch(transformedPos.x)
    const mappedY = mapper.pxToInch(transformedPos.y)

    // 提取旋转角度
    const rotation = (Math.abs(transform.a - 1) > 0.001 || Math.abs(transform.b) > 0.001)
      ? Math.atan2(transform.b, transform.a) * 180 / Math.PI
      : 0
    const hasRotation = Math.abs(rotation) > 0.01

    // 解析颜色
    const fillValue = element.attributes.fill || element.style.fill || '#000000'
    const colorResult = ColorParser.parseColor(fillValue)

    // 提取文本内容
    const text = this.extractText(element)

    // 处理 dominant-baseline 垂直对齐
    // SVG 的 y 是基线/中心位置，PPTX 的 y 是文本框顶部
    const dominantBaseline = element.attributes['dominant-baseline'] || element.style.dominantBaseline || ''
    const fontSizeInch = mapper.pxToInch(fontSize)
    let baselineOffset = 0
    let valign = 'top'
    switch (dominantBaseline) {
      case 'central':
      case 'middle':
        // 使用 valign='middle'，让文本框中心与 SVG y 对齐
        // 文本框高度 = fontSizeInch * 2.0，中心点在 y 上方 fontSizeInch 处
        baselineOffset = -fontSizeInch
        valign = 'middle'
        break
      case 'alphabetic':
      case 'baseline':
      case 'auto':
        // SVG 默认基线是 alphabetic，y 坐标是基线位置
        // 使用 valign='middle' 让文本在文本框内垂直居中
        // 文本框中心需要与 SVG 的基线位置对齐
        baselineOffset = -fontSizeInch
        valign = 'middle'
        break
      case 'hanging':
        baselineOffset = 0
        valign = 'top'
        break
      default:
        // 默认行为：无 dominant-baseline 时，SVG 文本使用 alphabetic 基线
        // 使用 valign='middle' 让文本在文本框内垂直居中
        baselineOffset = -fontSizeInch
        valign = 'middle'
    }

    const fontSizePt = fontSizeInch * 72

    // 估算文本尺寸（基于字符数和字体大小）
    // 使用非常宽松的估算，确保文本不会被换行
    const charCount = text.length
    const charWidthInch = fontSizeInch * 1.5 // 每字符宽度约等于字体大小的 1.5 倍（英寸）
    const textWidthInch = charCount * charWidthInch + 0.2 // 额外留白
    const textHeightInch = fontSizeInch * 1.2 // 文本高度约为字体大小的 1.2 倍（单行文本）

    const W = textWidthInch
    const H = textHeightInch
    const targetX = mappedX
    // 有旋转时，baselineOffset 由几何修正公式中的 anchorLocalY 处理，不额外偏移
    const targetY = hasRotation ? mappedY : mappedY + baselineOffset

    let textX: number
    const textW = W

    if (hasRotation) {
      // 有旋转：通过几何修正算法计算文本框左上角位置
      // PPTX 文本框围绕中心点 (x+W/2, y+H/2) 旋转
      // 需要保证旋转后文本锚点落在目标位置 (targetX, targetY)

      // 计算锚点在本地（未旋转）坐标系中的位置
      let anchorLocalX: number
      let anchorLocalY: number

      switch (textAnchor) {
        case 'end':    anchorLocalX = W; break
        case 'middle': anchorLocalX = W / 2; break
        default:       anchorLocalX = 0; break
      }

      switch (valign) {
        case 'middle': anchorLocalY = H / 2; break
        default:       anchorLocalY = 0; break
      }

      // 计算旋转后锚点的全局坐标（相对于文本框左上角）
      const thetaRad = rotation * Math.PI / 180
      const cosTheta = Math.cos(thetaRad)
      const sinTheta = Math.sin(thetaRad)

      const rotatedAnchorX = (W / 2) + (anchorLocalX - W / 2) * cosTheta - (anchorLocalY - H / 2) * sinTheta
      const rotatedAnchorY = (H / 2) + (anchorLocalX - W / 2) * sinTheta + (anchorLocalY - H / 2) * cosTheta

      // 放置文本框使旋转后的锚点落在目标位置
      textX = targetX - rotatedAnchorX
      const textY = targetY - rotatedAnchorY

      const options: Record<string, any> = {
        text,
        x: textX,
        y: textY,
        w: textW,
        h: H,
        fontSize: fontSizePt,
        fontFace: fontFamily,
        valign,
        rotate: rotation,
        margin: [0, 0, 0, 0], // 消除 PPTX 默认内边距
      }

      if (colorResult) {
        options.color = ColorParser.colorToPptxHex(colorResult)
      }

      // text-anchor 水平对齐
      switch (textAnchor) {
        case 'middle': options.align = 'center'; break
        case 'end': options.align = 'right'; break
        default: options.align = 'left'; break
      }

      if (fontWeight === 'bold' || parseInt(fontWeight) >= 600) {
        options.bold = true
      }

      // 透明度
      const fillOpacity = element.attributes['fill-opacity'] || element.style.fillOpacity
      const opacity = element.attributes.opacity || element.style.opacity
      if (fillOpacity !== undefined && fillOpacity !== '') {
        options.transparency = (1 - parseFloat(String(fillOpacity))) * 100
      } else if (opacity !== undefined && opacity !== '') {
        options.transparency = (1 - parseFloat(String(opacity))) * 100
      }

      return [{ type: 'text', ...options }]
    }

    // 无旋转：使用原有位置计算逻辑
    switch (textAnchor) {
      case 'middle':
        textX = targetX - W / 2
        break
      case 'end':
        textX = targetX - W
        break
      default:
        textX = targetX
        break
    }

    // 处理文字透明度
    const fillOpacity = element.attributes['fill-opacity'] || element.style.fillOpacity
    const opacity = element.attributes.opacity || element.style.opacity
    let textTransparency: number | undefined
    if (fillOpacity !== undefined && fillOpacity !== '') {
      textTransparency = (1 - parseFloat(String(fillOpacity))) * 100
    } else if (opacity !== undefined && opacity !== '') {
      textTransparency = (1 - parseFloat(String(opacity))) * 100
    }

    const options: Record<string, any> = {
      text,
      x: textX,
      y: targetY,
      w: textW,
      h: H,
      fontSize: fontSizePt,
      fontFace: fontFamily,
      valign,
      margin: [0, 0, 0, 0], // 消除 PPTX 默认内边距
      ...(textTransparency !== undefined ? { transparency: textTransparency } : {})
    }

    // 设置文本颜色
    if (colorResult) {
      options.color = ColorParser.colorToPptxHex(colorResult)
    }

    // 处理 text-anchor 水平对齐
    switch (textAnchor) {
      case 'middle':
        options.align = 'center'
        break
      case 'end':
        options.align = 'right'
        break
      default:
        options.align = 'left'
    }

    // 处理 font-weight 粗体
    if (fontWeight === 'bold' || parseInt(fontWeight) >= 600) {
      options.bold = true
    }

    return [{ type: 'text', ...options }]
  }

  /**
   * 从 SVG 文本元素中提取文本内容
   * 支持 tspan 子元素
   */
  private extractText(element: SVGElementNode): string {
    // 优先使用 textContent 属性（由 SVGParser 设置）
    if (element.textContent) {
      return element.textContent
    }
    // 回退到从子元素提取
    if (element.children && element.children.length > 0) {
      return element.children
        .map(child => child.textContent || '')
        .join('')
    }
    return ''
  }

  /**
   * 将通用字体族映射为具体字体
   * 确保 PPTX 中中文能正常显示
   */
  private resolveFontFamily(family: string): string {
    const genericFamilies = new Set([
      'serif',
      'sans-serif',
      'monospace',
      'cursive',
      'fantasy',
      'system-ui',
      'ui-serif',
      'ui-sans-serif',
      'ui-monospace',
      'ui-rounded',
      'emoji',
      'math',
      'fangsong',
      'inherit',
      'initial',
      'unset',
    ])

    const normalized = (family || '').trim()
    const families = normalized
      .split(',')
      .map((name) => name.trim().replace(/['"]/g, ''))
      .filter(Boolean)

    const isUsableInRuntime = (fontName: string): boolean => {
      if (!fontName) return false
      try {
        if (typeof document === 'undefined' || !document.fonts || typeof document.fonts.check !== 'function') {
          return false
        }
        return document.fonts.check(`12px "${fontName}"`) || document.fonts.check(`12px '${fontName}'`)
      } catch {
        return false
      }
    }

    const concreteFamilies = families.filter((name) => !genericFamilies.has(name.toLowerCase()))
    const usableConcrete = concreteFamilies.find((name) => isUsableInRuntime(name))
    if (usableConcrete) {
      return usableConcrete
    }

    if (concreteFamilies.length > 0) {
      return concreteFamilies[0]
    }

    // 通用字体族在 PPTX 中使用跨平台更稳定的回退
    const firstGeneric = families[0]?.toLowerCase() || ''
    if (firstGeneric === 'monospace') return 'Consolas'
    if (firstGeneric === 'serif') return 'Times New Roman'
    if (firstGeneric === 'sans-serif') return 'Microsoft YaHei'

    return 'Arial'
  }
}
