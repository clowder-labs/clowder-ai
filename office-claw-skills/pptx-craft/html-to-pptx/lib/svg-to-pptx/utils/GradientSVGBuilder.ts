import { LinearGradient, GradientStop, ColorRGBA, PathCommand } from '../types'

/**
 * SVG 渐变 XML 生成器
 * 将 svg-to-pptx 的渐变数据结构转换为完整的 SVG XML 字符串
 * 独立实现，不依赖 html-to-pptx 的 generateGradientSVG
 */
export class GradientSVGBuilder {
  /**
   * 将线性渐变定义构建为完整的 SVG XML 字符串
   * @param gradient - 线性渐变定义（来自 SVGParser）
   * @param widthPx - 生成 SVG 的宽度（px）
   * @param heightPx - 生成 SVG 的高度（px）
   * @param options - 可选参数（圆角、描边、路径形状、viewBox）
   * @returns SVG XML 字符串
   */
  buildLinear(
    gradient: LinearGradient,
    widthPx: number,
    heightPx: number,
    options?: { radius?: number; stroke?: { color: string; width: number }; pathD?: string; viewBox?: string; fillOpacity?: number }
  ): string {
    const { x1, y1, x2, y2 } = this.mapDirection(gradient)

    // 构建颜色停靠点 XML（不处理 fillOpacity，只使用 stop 自身的 alpha）
    const stopsXML = this.buildStopsXML(gradient.stops)

    // viewBox：如果有自定义 viewBox（用于匹配 path 绝对坐标），使用它
    const viewBoxAttr = options?.viewBox
      ? `viewBox="${options.viewBox}"`
      : `viewBox="0 0 ${widthPx} ${heightPx}"`

    // 描边处理
    let strokeAttr = ''
    if (options?.stroke) {
      strokeAttr = ` stroke="${options.stroke.color}" stroke-width="${options.stroke.width}"`
    }

    // 构建形状 XML
    // 注意：不在 SVG 内部设置 fill-opacity，因为 PowerPoint 对嵌入 SVG 的 fill-opacity 支持有限
    // 透明度通过 PptxGenJS 的 addImage transparency 参数处理
    let shapeFinal: string
    if (options?.pathD) {
      shapeFinal = `<path d="${options.pathD}" fill="url(#grad)"${strokeAttr} />`
    } else {
      // 圆角处理
      let rxAttr = ''
      if (options?.radius) {
        const maxRadius = Math.min(widthPx, heightPx) / 2
        const clampedRadius = Math.min(options.radius, maxRadius)
        rxAttr = `rx="${clampedRadius}" ry="${clampedRadius}"`
      }
      shapeFinal = `<rect x="0" y="0" width="${widthPx}" height="${heightPx}" ${rxAttr} fill="url(#grad)"${strokeAttr} />`
    }

    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" ${viewBoxAttr}>` +
      `<defs><linearGradient id="grad" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopsXML}</linearGradient></defs>` +
      shapeFinal +
      `</svg>`
    )
  }

  /**
   * 直接使用渐变定义中的 x1/y1/x2/y2 百分比坐标
   * SVG 的 linearGradient 坐标本身就是百分比，无需额外转换
   */
  private mapDirection(gradient: LinearGradient): {
    x1: string
    y1: string
    x2: string
    y2: string
  } {
    // SVG linearGradient 的坐标通常是 0-1 范围或百分比
    // 直接格式化为百分比字符串
    const fmt = (v: number) => `${(v * 100).toFixed(1)}%`
    return {
      x1: fmt(gradient.x1),
      y1: fmt(gradient.y1),
      x2: fmt(gradient.x2),
      y2: fmt(gradient.y2)
    }
  }

  /**
   * 构建颜色停靠点 XML 字符串
   */
  private buildStopsXML(stops: GradientStop[]): string {
    return stops
      .map((stop) => {
        const offset = `${(stop.offset * 100).toFixed(1)}%`
        const color = this.formatColor(stop.color)
        const opacity = stop.color.a < 1 ? ` stop-opacity="${stop.color.a}"` : ''
        return `<stop offset="${offset}" stop-color="${color}"${opacity}/>`
      })
      .join('')
  }

  /**
   * 将 ColorRGBA 格式化为 SVG 可识别的颜色字符串（不含 alpha）
   * alpha 通道通过 stop-opacity 属性单独设置
   */
  private formatColor(color: ColorRGBA): string {
    const r = Math.round(color.r)
    const g = Math.round(color.g)
    const b = Math.round(color.b)
    return `rgb(${r},${g},${b})`
  }
}
