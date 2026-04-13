import { SVGElementNode, Point } from '../types'
import { CoordinateMapper } from '../utils/CoordinateMapper'
import { TransformParser } from '../utils/TransformParser'
import { ElementConverter } from './ElementConverter'

export class ShapeConverter extends ElementConverter {
  /**
   * 转换 SVG 元素
   */
  async convertElement(
    element: SVGElementNode,
    mapper: CoordinateMapper
  ): Promise<any[]> {
    const transform = TransformParser.parseTransform(element.attributes.transform || '')

    switch (element.type) {
      case 'rect':
        return [this.convertRect(element, mapper, transform)]
      case 'circle':
      case 'ellipse':
        return [this.convertEllipse(element, mapper, transform)]
      case 'line':
        return [this.convertLine(element, mapper, transform)]
      case 'polygon':
      case 'polyline':
        return [await this.convertPolygon(element, mapper, transform)]
      default:
        return []
    }
  }

  /**
   * 解析 points 属性
   * 支持格式: 'x1,y1 x2,y2' 或 'x1 y1 x2 y2' 或混合格式
   */
  static parsePoints(pointsStr: string): Point[] {
    const trimmed = pointsStr.trim()
    if (!trimmed) return []

    // 检查是否包含逗号 - 如果包含，使用逗号分隔的格式
    if (trimmed.includes(',')) {
      return trimmed
        .split(/\s+/)
        .map(point => {
          const [x, y] = point.split(',').map(Number)
          return { x, y }
        })
    }

    // 纯空格分隔格式: x1 y1 x2 y2
    const parts = trimmed.split(/\s+/)
    const points: Point[] = []
    for (let i = 0; i < parts.length - 1; i += 2) {
      points.push({ x: parseFloat(parts[i]), y: parseFloat(parts[i + 1]) })
    }
    return points
  }

  /**
   * 将点集经过 transform 变换后输出 custGeom 对象
   * 通用方法：rect/ellipse 非平凡变换时共用
   */
  private pointsToCustGeom(
    points: Point[],
    transform: ReturnType<typeof TransformParser.parseTransform>,
    mapper: CoordinateMapper,
    fillOpts: Record<string, any>,
    lineOpts: Record<string, any>
  ): any {
    const transformedPoints = points.map(p => {
      const tp = TransformParser.applyTransformToPoint(transform, p)
      return mapper.mapPoint(tp)
    })

    // 计算包围盒
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of transformedPoints) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    const w = maxX - minX
    const h = maxY - minY

    // 转换为相对于包围盒左上角的坐标
    const geomPoints: Array<{ x: number; y: number; moveTo?: boolean; close?: boolean }> =
      transformedPoints.map((p, i) => ({
        x: p.x - minX,
        y: p.y - minY,
        ...(i === 0 ? { moveTo: true } : {})
      }))
    // 闭合
    geomPoints.push({ x: transformedPoints[0].x - minX, y: transformedPoints[0].y - minY, close: true })

    return {
      type: 'custGeom',
      x: minX,
      y: minY,
      w,
      h,
      points: geomPoints,
      ...fillOpts,
      ...lineOpts
    }
  }

  /**
   * 转换矩形
   */
  private convertRect(
    element: SVGElementNode,
    mapper: CoordinateMapper,
    transform: ReturnType<typeof TransformParser.parseTransform>
  ): any {
    const x = parseFloat(element.attributes.x || '0')
    const y = parseFloat(element.attributes.y || '0')
    const w = parseFloat(element.attributes.width || '0')
    const h = parseFloat(element.attributes.height || '0')

    const fillOpts = this.getPptxFillOptions(element, mapper)
    const lineOpts = this.getPptxLineOptions(element, mapper)

    // 判断是否为纯平移变换（无旋转/缩放/倾斜）
    const isTranslationOnly = Math.abs(transform.a - 1) < 0.001
      && Math.abs(transform.b) < 0.001
      && Math.abs(transform.c) < 0.001
      && Math.abs(transform.d - 1) < 0.001

    if (isTranslationOnly) {
      // 纯平移：保持 rect 类型
      const mapped = mapper.mapRect({ x, y, w, h })
      if (transform.e !== 0 || transform.f !== 0) {
        mapped.x += mapper.pxToInch(transform.e)
        mapped.y += mapper.pxToInch(transform.f)
      }

      // 处理圆角 rx 属性
      // PptxGenJS 的 rectRadius 是 0.0-1.0 的相对值
      // 表示圆角半径相对于矩形宽度/高度的比例
      const rx = element.attributes.rx
      let rectRadius: number | undefined
      if (rx) {
        const rxPx = parseFloat(rx)
        // 使用宽度作为参考计算相对值
        // rectRadius = rx / w，确保在 0-1 范围内
        if (w > 0) {
          rectRadius = Math.min(1, Math.max(0, rxPx / w))
        }
      }

      return {
        type: 'rect',
        x: mapped.x,
        y: mapped.y,
        w: mapped.w,
        h: mapped.h,
        ...(rectRadius ? { rectRadius } : {}),
        ...fillOpts,
        ...lineOpts
      }
    }

    // 非平凡变换：4 角点变换后转 custGeom
    const corners = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h }
    ]
    return this.pointsToCustGeom(corners, transform, mapper, fillOpts, lineOpts)
  }

  /**
   * 转换椭圆/圆形
   */
  private convertEllipse(
    element: SVGElementNode,
    mapper: CoordinateMapper,
    transform: ReturnType<typeof TransformParser.parseTransform>
  ): any {
    let cx: number, cy: number, rx: number, ry: number

    if (element.type === 'circle') {
      cx = parseFloat(element.attributes.cx || '0')
      cy = parseFloat(element.attributes.cy || '0')
      const r = parseFloat(element.attributes.r || '0')
      rx = r
      ry = r
    } else {
      cx = parseFloat(element.attributes.cx || '0')
      cy = parseFloat(element.attributes.cy || '0')
      rx = parseFloat(element.attributes.rx || '0')
      ry = parseFloat(element.attributes.ry || '0')
    }

    const fillOpts = this.getPptxFillOptions(element, mapper)
    const lineOpts = this.getPptxLineOptions(element, mapper)

    // 判断是否为纯平移变换
    const isTranslationOnly = Math.abs(transform.a - 1) < 0.001
      && Math.abs(transform.b) < 0.001
      && Math.abs(transform.c) < 0.001
      && Math.abs(transform.d - 1) < 0.001

    if (isTranslationOnly) {
      // 纯平移：保持 ellipse 类型
      const mappedCx = mapper.pxToInch(cx) + mapper.pxToInch(transform.e)
      const mappedCy = mapper.pxToInch(cy) + mapper.pxToInch(transform.f)
      const mappedRx = mapper.pxToInch(rx)
      const mappedRy = mapper.pxToInch(ry)
      return {
        type: 'ellipse',
        x: mappedCx - mappedRx,
        y: mappedCy - mappedRy,
        w: mappedRx * 2,
        h: mappedRy * 2,
        ...fillOpts,
        ...lineOpts
      }
    }

    // 非平凡变换：采样轮廓点后转 custGeom
    const numPoints = 48
    const sampledPoints: Point[] = []
    for (let i = 0; i < numPoints; i++) {
      const angle = (2 * Math.PI * i) / numPoints
      sampledPoints.push({
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle)
      })
    }
    return this.pointsToCustGeom(sampledPoints, transform, mapper, fillOpts, lineOpts)
  }

  /**
   * 转换直线
   */
  private convertLine(
    element: SVGElementNode,
    mapper: CoordinateMapper,
    transform: ReturnType<typeof TransformParser.parseTransform>
  ): any {
    const x1 = parseFloat(element.attributes.x1 || '0')
    const y1 = parseFloat(element.attributes.y1 || '0')
    const x2 = parseFloat(element.attributes.x2 || '0')
    const y2 = parseFloat(element.attributes.y2 || '0')

    const p1 = TransformParser.applyTransformToPoint(transform, { x: x1, y: y1 })
    const p2 = TransformParser.applyTransformToPoint(transform, { x: x2, y: y2 })

    const mp1 = mapper.mapPoint(p1)
    const mp2 = mapper.mapPoint(p2)

    const lineOpts = this.getPptxLineOptions(element, mapper)

    // 确保 w, h 为正值，通过 flipH/flipV 补偿线段方向
    const w = mp2.x - mp1.x
    const h = mp2.y - mp1.y

    return {
      type: 'line',
      x: w < 0 ? mp1.x + w : mp1.x,
      y: h < 0 ? mp1.y + h : mp1.y,
      w: Math.abs(w),
      h: Math.abs(h),
      flipH: w < 0,
      flipV: h < 0,
      ...lineOpts
    }
  }

  /**
   * 转换多边形/折线
   */
  private async convertPolygon(
    element: SVGElementNode,
    mapper: CoordinateMapper,
    transform: ReturnType<typeof TransformParser.parseTransform>
  ): Promise<any> {
    const points = ShapeConverter.parsePoints(element.attributes.points || '')
    const mappedPoints = points.map(p => {
      const tp = TransformParser.applyTransformToPoint(transform, p)
      return mapper.mapPoint(tp)
    })

    const fillOpts = this.getPptxFillOptions(element, mapper)
    const lineOpts = this.getPptxLineOptions(element, mapper)

    // 检查是否闭合（起点终点重合）
    const isClosed = mappedPoints.length > 2 && 
      Math.abs(mappedPoints[0].x - mappedPoints[mappedPoints.length - 1].x) < 0.001 &&
      Math.abs(mappedPoints[0].y - mappedPoints[mappedPoints.length - 1].y) < 0.001

    // polygon 或闭合的 polyline 使用 custGeom 类型以支持填充和描边
    if (element.type === 'polygon' || isClosed) {
      // 计算包围盒
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const p of mappedPoints) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
      const w = maxX - minX
      const h = maxY - minY

      // 检查是否是渐变填充的矩形（用于 legend）
      const fillAttr = element.attributes.fill || ''
      if (fillAttr.startsWith('url(') && this.gradients && this.gradientGenerator) {
        const gradientId = fillAttr.match(/url\(#([^)]+)\)/)?.[1]
        if (gradientId && this.gradients.has(gradientId)) {
          const gradient = this.gradients.get(gradientId)!
          // 将英寸转换为像素（假设 96 DPI）
          const widthPx = Math.max(1, Math.round(w * 96))
          const heightPx = Math.max(1, Math.round(h * 96))
          
          try {
            const imagePath = await this.gradientGenerator.generateGradientImage(
              gradient,
              widthPx,
              heightPx,
              gradientId
            )
            
            // 返回图片对象
            return {
              type: 'image',
              x: minX,
              y: minY,
              w,
              h,
              path: imagePath,
              ...lineOpts
            }
          } catch (e) {
            console.warn(`Failed to generate gradient image: ${e}`)
            // 回退到普通填充
          }
        }
      }

      // 转换为相对于包围盒左上角的坐标
      const geomPoints: Array<{x: number; y: number; moveTo?: boolean; close?: boolean}> = mappedPoints.map((p, i) => ({
        x: p.x - minX,
        y: p.y - minY,
        ...(i === 0 ? { moveTo: true } : {})
      }))
      // 添加闭合点
      geomPoints.push({ x: mappedPoints[0].x - minX, y: mappedPoints[0].y - minY, close: true })

      return {
        type: 'custGeom',
        x: minX,
        y: minY,
        w,
        h,
        points: geomPoints,
        ...fillOpts,
        ...lineOpts
      }
    }

    // 开放的 polyline 也使用 custGeom 格式（PptxGenJS 不支持 polyline 类型）
    // 计算包围盒
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of mappedPoints) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    const w = maxX - minX
    const h = maxY - minY

    // 转换为相对于包围盒左上角的坐标（不闭合）
    const geomPoints: Array<{x: number; y: number; moveTo?: boolean; close?: boolean}> = mappedPoints.map((p, i) => ({
      x: p.x - minX,
      y: p.y - minY,
      ...(i === 0 ? { moveTo: true } : {})
    }))

    return {
      type: 'custGeom',
      x: minX,
      y: minY,
      w,
      h,
      points: geomPoints,
      // 开放的 polyline 只有描边没有填充
      fill: undefined,
      ...lineOpts
    }
  }
}
