import { Gradient, LinearGradient, PPTXGradientImage, TransformMatrix } from '../types'
import { GradientSVGBuilder } from '../utils/GradientSVGBuilder'

/**
 * 渐变转换器
 * 将 SVG 渐变定义转换为 PPTX image 对象（SVG data URL）
 *
 * 职责：
 * - 接收 SVG Gradient 对象和目标形状尺寸
 * - 调用 GradientSVGBuilder 生成 SVG XML
 * - 编码为 base64 data URL
 * - 返回可直接传给 PPTXBuilder 的 image 对象
 */
export class GradientConverter {
  private svgBuilder: GradientSVGBuilder

  constructor() {
    this.svgBuilder = new GradientSVGBuilder()
  }

  /**
   * 将 SVG 渐变转换为 PPTX image 对象
   * @param gradient - SVG 渐变定义（来自 SVGParser 的映射表）
   * @param bounds - 目标形状的位置和尺寸（inches）
   * @param transform - 可选的变换矩阵，用于旋转/缩放渐变方向
   * @param pathD - 可选的 SVG path d 属性，用于保持原始路径形状
   *   当提供 pathD 时，需要同时提供 pathBbox 以便设置正确的 viewBox
   * @param pathBbox - pathD 的包围盒（SVG px 坐标），用于设置 viewBox 原点
   * @param stroke - 可选的描边选项
   * @returns PPTX image 对象，或 null（不支持的渐变类型）
   */
  convert(
    gradient: Gradient,
    bounds: { x: number; y: number; w: number; h: number },
    transform?: TransformMatrix,
    pathD?: string,
    stroke?: { color: string; width: number },
    pathBbox?: { x: number; y: number; w: number; h: number },
    fillOpacity?: number
  ): PPTXGradientImage | null {
    // 仅支持线性渐变
    if (gradient.type !== 'linear') {
      return null
    }

    return this.convertLinear(gradient, bounds, transform, pathD, stroke, pathBbox, fillOpacity)
  }

  /**
   * 转换线性渐变
   */
  private convertLinear(
    gradient: LinearGradient,
    bounds: { x: number; y: number; w: number; h: number },
    transform?: TransformMatrix,
    pathD?: string,
    stroke?: { color: string; width: number },
    pathBbox?: { x: number; y: number; w: number; h: number },
    fillOpacity?: number
  ): PPTXGradientImage {
    // 将英寸转换为像素（96 DPI），用于生成 SVG 的 width/height 属性
    const widthPx = Math.max(1, Math.round(bounds.w * 96))
    const heightPx = Math.max(1, Math.round(bounds.h * 96))

    // 如果有 transform，需要将其应用到渐变方向上
    let adjustedGradient = gradient
    if (transform) {
      adjustedGradient = this.applyTransformToGradient(gradient, transform)
    }

    // 如果有 pathD 和 pathBbox，设置 viewBox 匹配原始 path 坐标
    // viewBox 的大小必须与 pathBbox 匹配，否则 transform 缩放会导致不匹配
    const viewBox = pathBbox
      ? `${pathBbox.x} ${pathBbox.y} ${pathBbox.w} ${pathBbox.h}`
      : `0 0 ${widthPx} ${heightPx}`

    // 生成 SVG XML
    const svgXML = this.svgBuilder.buildLinear(adjustedGradient, widthPx, heightPx, { pathD, stroke, viewBox, fillOpacity })

    // 编码为 base64 data URL（使用 btoa 兼容浏览器和 Node.js）
    const base64 = typeof Buffer !== 'undefined'
      ? Buffer.from(svgXML, 'utf-8').toString('base64')
      : btoa(unescape(encodeURIComponent(svgXML)))
    const data = 'data:image/svg+xml;base64,' + base64

    return {
      type: 'image',
      data,
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
      // 使用 PptxGenJS 原生 transparency 参数设置图片透明度
      // PowerPoint 对 SVG 内部的 fill-opacity 支持有限，因此通过 addImage 的 transparency 选项来设置
      // PptxGenJS 的 transparency 是 0-100 范围，0=完全不透明，100=完全透明
      // 而 fillOpacity 是 0-1 范围，0=完全透明，1=完全不透明
      ...(fillOpacity !== undefined && fillOpacity < 1 ? { transparency: (1 - fillOpacity) * 100 } : {})
    }
  }

  /**
   * 将变换矩阵应用到渐变方向上
   *
   * SVG 的渐变是在变换之前应用的，所以当形状被 transform 旋转/缩放时，
   * 渐变方向也需要相应调整，以保持正确的视觉效果。
   *
   * @param gradient - 原始渐变定义
   * @param transform - 变换矩阵
   * @returns 调整后的渐变定义
   */
  private applyTransformToGradient(
    gradient: LinearGradient,
    transform: TransformMatrix
  ): LinearGradient {
    // 渐变起点和终点（0-1 范围）
    const { x1, y1, x2, y2 } = gradient

    // 将渐变方向视为从 (x1,y1) 到 (x2,y2) 的向量
    // 应用变换矩阵到这两个点
    // 注意：transform 矩阵是在形状坐标系中定义的
    // 我们需要将渐变坐标（0-1 范围）映射到形状坐标系，应用变换，再映射回来

    // 简单处理：对于旋转变换，直接应用到 0-1 范围的坐标上
    // matrix(a, b, c, d, e, f) 作用于点 (x, y):
    // x' = a*x + c*y + e
    // y' = b*x + d*y + f

    const p1x = transform.a * x1 + transform.c * y1 + transform.e
    const p1y = transform.b * x1 + transform.d * y1 + transform.f
    const p2x = transform.a * x2 + transform.c * y2 + transform.e
    const p2y = transform.b * x2 + transform.d * y2 + transform.f

    // 由于我们只关心渐变方向（相对位置），需要移除平移分量 (e, f)
    // 并归一化到 0-1 范围
    // 但更好的方法是：计算变换后的方向向量，然后重新映射

    // 实际上，对于渐变来说，我们只需要关心方向向量 (x2-x1, y2-y1) 如何被变换
    // 平移分量 e, f 对渐变方向没有影响（渐变是相对于形状的）

    const dx = x2 - x1
    const dy = y2 - y1

    // 变换方向向量（只使用旋转/缩放部分，忽略平移）
    const newDx = transform.a * dx + transform.c * dy
    const newDy = transform.b * dx + transform.d * dy

    // 新的起点保持原点（或取变换后起点的相对位置）
    // 实际上，对于 objectBoundingBox 渐变，我们只需要方向
    // 起点 (x1, y1) 变换后的位置：
    const newX1 = transform.a * x1 + transform.c * y1
    const newY1 = transform.b * x1 + transform.d * y1
    const newX2 = newX1 + newDx
    const newY2 = newY1 + newDy

    return {
      ...gradient,
      x1: newX1,
      y1: newY1,
      x2: newX2,
      y2: newY2
    }
  }
}
