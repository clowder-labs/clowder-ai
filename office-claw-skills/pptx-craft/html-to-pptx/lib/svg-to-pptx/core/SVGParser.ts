import { SVGElementNode, TransformMatrix, StyleProperties, Gradient, LinearGradient, RadialGradient } from '../types'
import { DOMDocument, DOMNode } from '../platform/types'
import { DOMParserInterface } from '../platform'

export interface ParseResult {
  root: SVGElementNode | null
  gradients: Map<string, Gradient>
}

export class SVGParser {
  private domParser: DOMParserInterface

  constructor(domParser: DOMParserInterface) {
    this.domParser = domParser
  }

  /**
   * 解析 SVG 字符串为 SVGElementNode 树和渐变定义
   */
  parse(svgString: string): ParseResult {
    const doc = this.domParser.parseFromString(svgString)

    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      console.error('SVG parse error:', parseError.textContent)
      return { root: null, gradients: new Map() }
    }

    const svgElement = doc.documentElement

    // 提取渐变定义
    const gradients = this.extractGradients(svgElement)

    return {
      root: this.parseElement(svgElement),
      gradients
    }
  }

  /**
   * 从 SVG 文档中提取所有渐变定义
   */
  private extractGradients(svgElement: DOMNode): Map<string, Gradient> {
    const gradients = new Map<string, Gradient>()

    // 查找所有 linearGradient 和 radialGradient
    const linearGradients = svgElement.querySelectorAll('linearGradient')
    const radialGradients = svgElement.querySelectorAll('radialGradient')

    for (const grad of Array.from(linearGradients)) {
      const id = grad.getAttribute('id')
      if (id) {
        const gradient = this.parseLinearGradient(grad)
        if (gradient) {
          gradients.set(id, gradient)
        }
      }
    }

    for (const grad of Array.from(radialGradients)) {
      const id = grad.getAttribute('id')
      if (id) {
        const gradient = this.parseRadialGradient(grad)
        if (gradient) {
          gradients.set(id, gradient)
        }
      }
    }

    return gradients
  }

  /**
   * 解析百分比值，返回 0-1 范围的小数
   * SVG 渐变坐标可以是百分比（如 "50%"）或小数（如 "0.5"）
   */
  private parsePercentage(value: string): number {
    const trimmed = value.trim()
    if (trimmed.includes('%')) {
      return parseFloat(trimmed) / 100
    }
    return parseFloat(trimmed)
  }

  /**
   * 解析线性渐变
   */
  private parseLinearGradient(element: DOMNode): LinearGradient | null {
    const x1 = this.parsePercentage(element.getAttribute('x1') || '0')
    const y1 = this.parsePercentage(element.getAttribute('y1') || '0')
    const x2 = this.parsePercentage(element.getAttribute('x2') || '0')
    const y2 = this.parsePercentage(element.getAttribute('y2') || '1')

    const stops = this.parseGradientStops(element)
    if (stops.length === 0) return null

    return {
      type: 'linear',
      x1, y1, x2, y2,
      stops
    }
  }

  /**
   * 解析径向渐变
   */
  private parseRadialGradient(element: DOMNode): RadialGradient | null {
    const cx = this.parsePercentage(element.getAttribute('cx') || '0.5')
    const cy = this.parsePercentage(element.getAttribute('cy') || '0.5')
    const r = this.parsePercentage(element.getAttribute('r') || '0.5')

    const stops = this.parseGradientStops(element)
    if (stops.length === 0) return null

    return {
      type: 'radial',
      cx, cy, r,
      stops
    }
  }

  /**
   * 解析渐变停止点
   */
  private parseGradientStops(element: DOMNode): Array<{offset: number, color: {r: number, g: number, b: number, a: number}}> {
    const stops: Array<{offset: number, color: {r: number, g: number, b: number, a: number}}> = []

    for (const stop of Array.from(element.querySelectorAll('stop'))) {
      const offsetStr = stop.getAttribute('offset') || '0'
      const offset = parseFloat(offsetStr.replace('%', '')) / (offsetStr.includes('%') ? 100 : 1)

      let colorStr = stop.getAttribute('stop-color') || ''
      // 处理 style 属性中的 stop-color
      const style = stop.getAttribute('style') || ''
      const stopColorMatch = style.match(/stop-color:\s*([^;]+)/)
      if (stopColorMatch) {
        colorStr = stopColorMatch[1].trim()
      }

      const color = this.parseColorString(colorStr)
      if (color) {
        // 处理 stop-opacity 属性
        const stopOpacity = stop.getAttribute('stop-opacity')
        if (stopOpacity !== null) {
          color.a = parseFloat(stopOpacity)
        }

        // 处理 style 属性中的 stop-opacity
        const stopOpacityStyleMatch = style.match(/stop-opacity:\s*([^;]+)/)
        if (stopOpacityStyleMatch) {
          color.a = parseFloat(stopOpacityStyleMatch[1])
        }

        stops.push({ offset, color })
      }
    }

    return stops
  }

  /**
   * 解析颜色字符串
   */
  private parseColorString(colorStr: string): {r: number, g: number, b: number, a: number} | null {
    if (!colorStr) return null

    const normalized = colorStr.trim().toLowerCase()

    // 处理 rgb/rgba
    const rgbMatch = normalized.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/)
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1], 10),
        g: parseInt(rgbMatch[2], 10),
        b: parseInt(rgbMatch[3], 10),
        a: rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1
      }
    }

    // 处理 hex
    if (normalized.startsWith('#')) {
      const hex = normalized
      if (hex.length === 4) {
        return {
          r: parseInt(hex[1] + hex[1], 16),
          g: parseInt(hex[2] + hex[2], 16),
          b: parseInt(hex[3] + hex[3], 16),
          a: 1
        }
      } else if (hex.length === 7) {
        return {
          r: parseInt(hex.slice(1, 3), 16),
          g: parseInt(hex.slice(3, 5), 16),
          b: parseInt(hex.slice(5, 7), 16),
          a: 1
        }
      }
    }

    return null
  }

  /**
   * 解析单个 DOM 元素为 SVGElementNode
   */
  private parseElement(element: DOMNode): SVGElementNode {
    const type = element.tagName.toLowerCase()
    const attributes: Record<string, string> = {}
    const style: StyleProperties = {}

    // 解析属性
    for (const key of Object.keys(element.attributes)) {
      attributes[key] = element.attributes[key]
    }

    // 解析 style 属性
    if (element.hasAttribute('style')) {
      const styleStr = element.getAttribute('style') || ''
      styleStr.split(';').forEach(rule => {
        const [prop, ...valueParts] = rule.split(':')
        if (prop && valueParts.length) {
          style[prop.trim()] = valueParts.join(':').trim()
        }
      })
    }

    // 解析 transform
    let transform: TransformMatrix | undefined
    if (attributes.transform) {
      transform = this.parseTransformString(attributes.transform)
    }

    // 递归解析子元素
    const children: SVGElementNode[] = []
    for (const child of element.children) {
      children.push(this.parseElement(child))
    }

    const node: SVGElementNode = {
      type,
      attributes,
      children,
      transform,
      style
    }

    // 对 svg 根元素，如果缺少 width/height 则从 viewBox 推导
    if (type === 'svg' && attributes.viewBox) {
      const parts = attributes.viewBox.split(/\s+/)
      if (!attributes.width && parts.length >= 4) {
        attributes.width = parts[2]
      }
      if (!attributes.height && parts.length >= 4) {
        attributes.height = parts[3]
      }
    }

    // 对 text 元素保存 textContent
    if (type === 'text') {
      ;(node as any).textContent = this.extractTextContent(element)
    }

    return node
  }

  /**
   * 解析 transform 属性字符串为 TransformMatrix
   */
  private parseTransformString(value: string): TransformMatrix {
    const regex = /(translate|scale|rotate|skewX|skewY|matrix)\(([^)]*)\)/g
    let match
    let result: TransformMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

    while ((match = regex.exec(value)) !== null) {
      const fn = match[1]
      const params = match[2].split(/[\s,]+/).map(s => parseFloat(s.trim())).filter(n => !isNaN(n))

      switch (fn) {
        case 'translate':
          result.e += params[0] || 0
          result.f += params[1] || 0
          break
        case 'scale':
          result.a *= params[0] || 1
          result.d *= (params[1] ?? params[0]) || 1
          break
        case 'rotate':
          const rad = (params[0] || 0) * Math.PI / 180
          const cos = Math.cos(rad)
          const sin = Math.sin(rad)
          result = {
            a: result.a * cos + result.c * sin,
            b: result.b * cos + result.d * sin,
            c: result.a * -sin + result.c * cos,
            d: result.b * -sin + result.d * cos,
            e: result.e,
            f: result.f
          }
          break
        case 'matrix':
          result = {
            a: params[0], b: params[1], c: params[2],
            d: params[3], e: params[4], f: params[5]
          }
          break
      }
    }

    return result
  }

  /**
   * 提取 text 元素的文本内容
   */
  private extractTextContent(element: DOMNode): string {
    // DOMNode.textContent 已经包含了所有文本内容（包括直接文本和子元素文本）
    return element.textContent || ''
  }
}
