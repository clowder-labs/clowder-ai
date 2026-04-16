import { SVGElementNode, Point, PathCommand, TransformMatrix } from '../types'
import { CoordinateMapper } from '../utils/CoordinateMapper'
import { TransformParser } from '../utils/TransformParser'
import { ElementConverter } from './ElementConverter'

export class PathConverter extends ElementConverter {
  /**
   * 解析 SVG path d 属性为命令数组
   */
  static parsePath(d: string): PathCommand[] {
    const commands: PathCommand[] = []
    const regex = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?\d*\.?\d+(?:e[+-]?\d+)?)/gi
    let match
    let currentCmd = ''
    let currentParams: number[] = []

    const flushCmd = () => {
      if (currentCmd) {
        commands.push({ type: currentCmd as PathCommand['type'], params: currentParams })
        currentParams = []
      }
    }

    while ((match = regex.exec(d)) !== null) {
      if (match[1]) {
        flushCmd()
        currentCmd = match[1]
      } else if (match[2]) {
        currentParams.push(parseFloat(match[2]))
      }
    }

    flushCmd()

    // 先展开隐式命令（此时还保留大小写）
    const expanded = this.expandImplicitCommands(commands)
    // 将相对命令转为绝对命令
    return this.relativeToAbsolute(expanded)
  }

  /**
   * 转换 SVG path 元素
   */
  convertElement(
    element: SVGElementNode,
    mapper: CoordinateMapper
  ): any[] {
    const d = element.attributes.d || ''
    if (!d) return []

    const commands = PathConverter.parsePath(d)
    const transform = TransformParser.parseTransform(element.attributes.transform || '')

    const fillOpts = this.getPptxFillOptions(element, mapper)
    const lineOpts = this.getPptxLineOptions(element, mapper)

    // 检查是否有多个子路径（多个 M 命令）
    const mCount = commands.filter(c => c.type === 'M').length
    if (mCount > 1) {
      // 拆分为多个子路径，每个 M 开始一个新子路径
      const subpaths = this.splitIntoSubpaths(commands)
      const results: any[] = []
      for (const subpath of subpaths) {
        const hasClose = subpath.some(c => c.type === 'Z')
        const subBbox = this.getBbox(subpath, transform)

        // 检测是否为圆形
        const circle = this.detectCircle(subpath)
        if (circle) {
          const center = TransformParser.applyTransformToPoint(transform, { x: circle.cx, y: circle.cy })
          const scaleX = Math.sqrt(transform.a * transform.a + transform.b * transform.b)
          const mappedCx = mapper.pxToInch(center.x)
          const mappedCy = mapper.pxToInch(center.y)
          const mappedR = mapper.pxToInch(circle.r * scaleX)

          results.push({
            type: 'ellipse',
            x: mappedCx - mappedR,
            y: mappedCy - mappedR,
            w: mappedR * 2,
            h: mappedR * 2,
            ...fillOpts,
            ...lineOpts
          })
          continue
        }

        // 检查子路径是否闭合（有 Z 命令或起点终点重合）
        const subpathClosed = hasClose || this.isPathClosed(subpath)
        if (subpathClosed) {
          // 渐变填充：用 path 形状 + 渐变生成 image
          if (fillOpts.fill?.type === 'gradient-ref' && this.gradientConverter) {
            const gradientId = fillOpts.fill.gradientId
            const gradient = this.gradients!.get(gradientId)!
            const bounds = {
              x: mapper.pxToInch(subBbox.x),
              y: mapper.pxToInch(subBbox.y),
              w: mapper.pxToInch(subBbox.w),
              h: mapper.pxToInch(subBbox.h)
            }
            // 将子路径命令转换回 d 属性字符串
            const subpathD = this.commandsToPathD(subpath)
            // 计算原始坐标下的包围盒（不应用 transform），直接用于 viewBox
            // viewBox 坐标必须与 path d 中的绝对坐标匹配
            const subBboxPx = this.getBbox(subpath, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
            // 提取描边信息
            const strokeOpts = lineOpts.line ? { color: lineOpts.line.color, width: lineOpts.line.width } : undefined
            // 提取 fill-opacity
            const fillOpacityStr = element.attributes['fill-opacity'] || element.attributes.style?.match(/fill-opacity:\s*([^;]+)/)?.[1]
            const fillOpacity = fillOpacityStr !== undefined ? parseFloat(String(fillOpacityStr)) : 1
            const imageObj = this.gradientConverter.convert(gradient, bounds, transform, subpathD, strokeOpts, subBboxPx, isNaN(fillOpacity) ? 1 : fillOpacity)
            if (imageObj) {
              results.push({ ...imageObj })
              continue
            }
          }
          // 闭合子路径：用几何形状渲染填充
          const points = this.pathToPoints(subpath, mapper, transform, subBbox)
          results.push({
            type: 'custGeom',
            x: mapper.pxToInch(subBbox.x),
            y: mapper.pxToInch(subBbox.y),
            w: mapper.pxToInch(subBbox.w),
            h: mapper.pxToInch(subBbox.h),
            points: points,
            ...fillOpts,
            ...lineOpts
          })
        } else {
          // 开放子路径：用线段渲染（不填充）
          const pts = this.pathToLinePoints(subpath, mapper, transform)
          if (pts.length >= 2) {
            // 对每对相邻点创建一条线
            for (let j = 0; j < pts.length - 1; j++) {
              const x1 = pts[j].x
              const y1 = pts[j].y
              const x2 = pts[j + 1].x
              const y2 = pts[j + 1].y
              const w = x2 - x1
              const h = y2 - y1

              // PptxGenJS 的 line 形状不支持负的 w 或 h
              // 需要调整 x, y 使 w, h 都为正数
              // 同时通过 flipH/flipV 补偿线段方向，避免终点在起点上方或左方时发生翻转
              results.push({
                type: 'line',
                x: w < 0 ? x1 + w : x1,
                y: h < 0 ? y1 + h : y1,
                w: Math.abs(w),
                h: Math.abs(h),
                flipH: w < 0,
                flipV: h < 0,
                ...lineOpts
              })
            }
          }
        }
      }
      return results
    }

    // 单一路径：检测是否为圆形
    const circle = this.detectCircle(commands)
    if (circle) {
      // 圆形路径：使用 ellipse 形状
      const center = TransformParser.applyTransformToPoint(transform, { x: circle.cx, y: circle.cy })
      // 对于均匀缩放矩阵，半径也按相同比例缩放
      const scaleX = Math.sqrt(transform.a * transform.a + transform.b * transform.b)
      const mappedCx = mapper.pxToInch(center.x)
      const mappedCy = mapper.pxToInch(center.y)
      const mappedR = mapper.pxToInch(circle.r * scaleX)

      return [{
        type: 'ellipse',
        x: mappedCx - mappedR,
        y: mappedCy - mappedR,
        w: mappedR * 2,
        h: mappedR * 2,
        ...fillOpts,
        ...lineOpts
      }]
    }

    const hasClose = commands.some(c => c.type === 'Z')
    // 即使没有 Z 命令，如果起点和终点重合也视为闭合路径
    const isClosedPath = hasClose || this.isPathClosed(commands)

    if (isClosedPath) {
      // 闭合路径
      const bbox = this.getBbox(commands, transform)

      // 渐变填充：用 path 形状生成 image（保持原始路径形状）
      if (fillOpts.fill?.type === 'gradient-ref' && this.gradientConverter) {
        const gradientId = fillOpts.fill.gradientId
        const gradient = this.gradients!.get(gradientId)!
        const bounds = {
          x: mapper.pxToInch(bbox.x),
          y: mapper.pxToInch(bbox.y),
          w: mapper.pxToInch(bbox.w),
          h: mapper.pxToInch(bbox.h)
        }
        // 计算原始坐标下的包围盒（不应用 transform），直接用于 viewBox
        // viewBox 坐标必须与 path d 中的绝对坐标匹配
        const bboxPx = this.getBbox(commands, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
        // 提取描边信息
        const strokeOpts = lineOpts.line ? { color: lineOpts.line.color, width: lineOpts.line.width } : undefined
        // 提取 fill-opacity
        const fillOpacityStr = element.attributes['fill-opacity'] || element.attributes.style?.match(/fill-opacity:\s*([^;]+)/)?.[1]
        const fillOpacity = fillOpacityStr !== undefined ? parseFloat(String(fillOpacityStr)) : 1
        const imageObj = this.gradientConverter.convert(gradient, bounds, transform, d, strokeOpts, bboxPx, isNaN(fillOpacity) ? 1 : fillOpacity)
        if (imageObj) {
          return [{ ...imageObj }]
        }
      }

      // 普通填充：使用自定义几何形状
      const points = this.pathToPoints(commands, mapper, transform, bbox)

      return [{
        type: 'custGeom',
        x: mapper.pxToInch(bbox.x),
        y: mapper.pxToInch(bbox.y),
        w: mapper.pxToInch(bbox.w),
        h: mapper.pxToInch(bbox.h),
        points: points,
        ...fillOpts,
        ...lineOpts
      }]
    } else {
      // 开放路径：检查是否为简单的直线（M + L）
      if (this.isSimpleLine(commands)) {
        const [startX, startY] = commands[0].params
        const [endX, endY] = commands[1].params
        const p1 = TransformParser.applyTransformToPoint(transform, { x: startX, y: startY })
        const p2 = TransformParser.applyTransformToPoint(transform, { x: endX, y: endY })
        const mp1 = mapper.mapPoint(p1)
        const mp2 = mapper.mapPoint(p2)

        // 确保 w, h 为正值，通过 flipH/flipV 补偿线段方向
        const w = mp2.x - mp1.x
        const h = mp2.y - mp1.y

        return [{
          type: 'line',
          x: w < 0 ? mp1.x + w : mp1.x,
          y: h < 0 ? mp1.y + h : mp1.y,
          w: Math.abs(w),
          h: Math.abs(h),
          flipH: w < 0,
          flipV: h < 0,
          ...lineOpts
        }]
      }

      // 复杂曲线路径：使用自定义几何形状渲染（无填充）
      const bbox = this.getBbox(commands, transform)
      const points = this.pathToPointsWithCurves(commands, mapper, transform, bbox)

      return [{
        type: 'custGeom',
        x: mapper.pxToInch(bbox.x),
        y: mapper.pxToInch(bbox.y),
        w: mapper.pxToInch(bbox.w),
        h: mapper.pxToInch(bbox.h),
        points: points,
        ...lineOpts
      }]
    }
  }

  /**
   * 检查路径是否为简单的直线（M + L 两个命令）
   */
  private isSimpleLine(commands: PathCommand[]): boolean {
    if (commands.length !== 2) return false
    return commands[0].type === 'M' && commands[1].type === 'L'
  }

  /**
   * 检测路径是否闭合（起点和终点重合，即使没有 Z 命令）
   */
  private isPathClosed(commands: PathCommand[]): boolean {
    if (commands.length < 2) return false
    
    // 找到第一个 M 命令作为起点
    const firstM = commands.find(c => c.type === 'M')
    if (!firstM) return false
    
    const [sx, sy] = firstM.params
    
    // 找到最后一个非 Z 命令的终点
    let lastCmd: PathCommand | null = null
    for (let i = commands.length - 1; i >= 0; i--) {
      if (commands[i].type !== 'Z') {
        lastCmd = commands[i]
        break
      }
    }
    if (!lastCmd) return false
    
    // 获取终点坐标
    let ex = sx, ey = sy
    const params = lastCmd.params
    switch (lastCmd.type) {
      case 'M':
        ex = params[0]; ey = params[1]
        break
      case 'L':
      case 'Q':
        ex = params[params.length - 2]; ey = params[params.length - 1]
        break
      case 'C':
        ex = params[4]; ey = params[5]
        break
      case 'A':
        ex = params[5]; ey = params[6]
        break
      case 'H':
        ex = params[0]
        break
      case 'V':
        ey = params[0]
        break
    }
    
    // 检查起点和终点是否重合（容差 0.01）
    return Math.abs(sx - ex) < 0.01 && Math.abs(sy - ey) < 0.01
  }

  /**
   * 检测路径是否为圆形（M + A 且起点终点重合的大弧）
   * 如果是，返回圆心和半径（在原始路径空间中）
   */
  private detectCircle(commands: PathCommand[]): { cx: number; cy: number; r: number } | null {
    if (commands.length !== 2) return null
    if (commands[0].type !== 'M') return null
    if (commands[1].type !== 'A') return null

    const [sx, sy] = commands[0].params
    const [rx, ry, _rot, largeArc, _sweep, ex, ey] = commands[1].params

    // 起点和终点必须几乎重合
    // 容差随半径增大而放宽，以应对 SVG 浮点数精度误差
    const tolerance = Math.max(0.05, Math.max(rx, ry) * 0.001)
    if (Math.abs(sx - ex) > tolerance || Math.abs(sy - ey) > tolerance) return null
    // 必须是大弧
    if (!largeArc) return null
    // rx 和 ry 应该接近（圆而非椭圆）
    if (Math.abs(rx - ry) / Math.max(rx, ry) > 0.1) return null

    const r = Math.max(rx, ry)
    // 圆心 = 起点 - (rx, 0)（假设起点在圆的最右侧）
    return { cx: sx - rx, cy: sy, r }
  }

  /**
   * 将路径命令拆分为多个子路径（每个 M 开始一个新子路径）
   */
  private splitIntoSubpaths(commands: PathCommand[]): PathCommand[][] {
    const subpaths: PathCommand[][] = []
    let current: PathCommand[] = []

    for (const cmd of commands) {
      if (cmd.type === 'M') {
        if (current.length > 0) {
          subpaths.push(current)
        }
        current = [cmd]
      } else {
        current.push(cmd)
      }
    }
    if (current.length > 0) {
      subpaths.push(current)
    }

    return subpaths
  }

  /**
   * 将 PathCommand 数组转换为 SVG path d 属性字符串
   */
  private commandsToPathD(commands: PathCommand[]): string {
    const parts: string[] = []
    for (const cmd of commands) {
      const params = cmd.params.map(p => String(p)).join(' ')
      if (params) {
        parts.push(`${cmd.type}${params}`)
      } else {
        parts.push(cmd.type)
      }
    }
    return parts.join(' ')
  }

  /**
   * 将路径命令转换为线段端点数组
   */
  private pathToLinePoints(
    commands: PathCommand[],
    mapper: CoordinateMapper,
    transform: TransformMatrix
  ): Point[] {
    const points: Point[] = []
    let cx = 0, cy = 0

    for (const cmd of commands) {
      const params = cmd.params
      switch (cmd.type) {
        case 'M':
          cx = params[0]; cy = params[1]
          { const tp = TransformParser.applyTransformToPoint(transform, { x: cx, y: cy })
            points.push(mapper.mapPoint(tp)) }
          break
        case 'L':
          cx = params[0]; cy = params[1]
          { const tp = TransformParser.applyTransformToPoint(transform, { x: cx, y: cy })
            points.push(mapper.mapPoint(tp)) }
          break
        case 'H':
          cx = params[0]
          { const tp = TransformParser.applyTransformToPoint(transform, { x: cx, y: cy })
            points.push(mapper.mapPoint(tp)) }
          break
        case 'V':
          cy = params[0]
          { const tp = TransformParser.applyTransformToPoint(transform, { x: cx, y: cy })
            points.push(mapper.mapPoint(tp)) }
          break
        case 'C':
          // 采样三次贝塞尔曲线
          { const cubicPoints = this.sampleCubicBezier(
              { x: cx, y: cy },
              { x: params[0], y: params[1] },
              { x: params[2], y: params[3] },
              { x: params[4], y: params[5] }
            )
            for (const pt of cubicPoints) {
              const tp = TransformParser.applyTransformToPoint(transform, pt)
              points.push(mapper.mapPoint(tp))
            }
            cx = params[4]; cy = params[5] }
          break
        case 'Q':
          // 采样二次贝塞尔曲线
          { const quadPoints = this.sampleQuadraticBezier(
              { x: cx, y: cy },
              { x: params[0], y: params[1] },
              { x: params[2], y: params[3] }
            )
            for (const pt of quadPoints) {
              const tp = TransformParser.applyTransformToPoint(transform, pt)
              points.push(mapper.mapPoint(tp))
            }
            cx = params[2]; cy = params[3] }
          break
        case 'A':
          // 采样弧线段
          { const arcPoints = this.sampleArc(
              { x: cx, y: cy },
              params[0], params[1], params[2], params[3], params[4], params[5], params[6]
            )
            for (const pt of arcPoints) {
              const tp = TransformParser.applyTransformToPoint(transform, pt)
              points.push(mapper.mapPoint(tp))
            }
            cx = params[5]; cy = params[6] }
          break
        default:
          if (params.length >= 2) {
            cx = params[params.length - 2]
            cy = params[params.length - 1]
            const tp = TransformParser.applyTransformToPoint(transform, { x: cx, y: cy })
            points.push(mapper.mapPoint(tp))
          }
          break
      }
    }

    return points
  }

  /**
   * 展开隐式命令 (M 坐标1 坐标2 ... -> M 坐标1 L 坐标2 ...)
   * 同时处理小写 m 的隐式 l
   */
  private static expandImplicitCommands(commands: PathCommand[]): PathCommand[] {
    const result: PathCommand[] = []

    for (const cmd of commands) {
      if (cmd.type === 'M' && cmd.params.length > 2) {
        result.push({ type: 'M', params: cmd.params.slice(0, 2) })
        for (let i = 2; i < cmd.params.length; i += 2) {
          result.push({ type: 'L', params: cmd.params.slice(i, i + 2) })
        }
      } else if (cmd.type === 'm' && cmd.params.length > 2) {
        result.push({ type: 'm', params: cmd.params.slice(0, 2) })
        for (let i = 2; i < cmd.params.length; i += 2) {
          result.push({ type: 'l', params: cmd.params.slice(i, i + 2) })
        }
      } else {
        result.push(cmd)
      }
    }

    return result
  }

  /**
   * 将相对路径命令转换为绝对命令
   */
  private static relativeToAbsolute(commands: PathCommand[]): PathCommand[] {
    const result: PathCommand[] = []
    let cx = 0, cy = 0 // 当前点
    let sx = 0, sy = 0 // 子路径起点（用于 Z）
    let prevCx = 0, prevCy = 0 // 上一个 C/Q 的控制点（用于 S/T）
    let prevCmdType = '' // 上一个命令类型

    for (const cmd of commands) {
      const p = cmd.params
      switch (cmd.type) {
        case 'M':
          cx = p[0]; cy = p[1]
          sx = cx; sy = cy
          result.push({ type: 'M', params: [cx, cy] })
          prevCmdType = 'M'
          break

        case 'm':
          cx += p[0]; cy += p[1]
          sx = cx; sy = cy
          result.push({ type: 'M', params: [cx, cy] })
          prevCmdType = 'M'
          break

        case 'L':
          cx = p[0]; cy = p[1]
          result.push({ type: 'L', params: [cx, cy] })
          prevCmdType = 'L'
          break

        case 'l':
          cx += p[0]; cy += p[1]
          result.push({ type: 'L', params: [cx, cy] })
          prevCmdType = 'L'
          break

        case 'H':
          cx = p[0]
          result.push({ type: 'L', params: [cx, cy] })
          prevCmdType = 'L'
          break

        case 'h':
          cx += p[0]
          result.push({ type: 'L', params: [cx, cy] })
          prevCmdType = 'L'
          break

        case 'V':
          cy = p[0]
          result.push({ type: 'L', params: [cx, cy] })
          prevCmdType = 'L'
          break

        case 'v':
          cy += p[0]
          result.push({ type: 'L', params: [cx, cy] })
          prevCmdType = 'L'
          break

        case 'C': {
          const [cp1x, cp1y, cp2x, cp2y, ex, ey] = p
          prevCx = cp2x; prevCy = cp2y
          cx = ex; cy = ey
          result.push({ type: 'C', params: [cp1x, cp1y, cp2x, cp2y, cx, cy] })
          prevCmdType = 'C'
          break
        }

        case 'c': {
          const cp1x = cx + p[0], cp1y = cy + p[1]
          const cp2x = cx + p[2], cp2y = cy + p[3]
          cx += p[4]; cy += p[5]
          prevCx = cp2x; prevCy = cp2y
          result.push({ type: 'C', params: [cp1x, cp1y, cp2x, cp2y, cx, cy] })
          prevCmdType = 'C'
          break
        }

        case 'S': {
          // 平滑三次贝塞尔：控制点1为上一个控制点关于当前点的反射
          let cpx: number, cpy: number
          // 上一个命令是 C 或 S 时才反射
          if (prevCmdType === 'C' || prevCmdType === 'S') {
            cpx = cx + (cx - prevCx)
            cpy = cy + (cy - prevCy)
          } else {
            cpx = cx; cpy = cy
          }
          const cp2x = p[0], cp2y = p[1]
          cx = p[2]; cy = p[3]
          prevCx = cp2x; prevCy = cp2y
          result.push({ type: 'C', params: [cpx, cpy, cp2x, cp2y, cx, cy] })
          prevCmdType = 'S'
          break
        }

        case 's': {
          let cpx: number, cpy: number
          if (prevCmdType === 'C' || prevCmdType === 'S') {
            cpx = cx + (cx - prevCx)
            cpy = cy + (cy - prevCy)
          } else {
            cpx = cx; cpy = cy
          }
          const cp2x = cx + p[0], cp2y = cy + p[1]
          cx += p[2]; cy += p[3]
          prevCx = cp2x; prevCy = cp2y
          result.push({ type: 'C', params: [cpx, cpy, cp2x, cp2y, cx, cy] })
          prevCmdType = 'S'
          break
        }

        case 'Q': {
          const [cpx, cpy, ex, ey] = p
          prevCx = cpx; prevCy = cpy
          cx = ex; cy = ey
          result.push({ type: 'Q', params: [cpx, cpy, cx, cy] })
          prevCmdType = 'Q'
          break
        }

        case 'q': {
          const cpx = cx + p[0], cpy = cy + p[1]
          cx += p[2]; cy += p[3]
          prevCx = cpx; prevCy = cpy
          result.push({ type: 'Q', params: [cpx, cpy, cx, cy] })
          prevCmdType = 'Q'
          break
        }

        case 'T': {
          let cpx: number, cpy: number
          if (prevCmdType === 'Q' || prevCmdType === 'T') {
            cpx = cx + (cx - prevCx)
            cpy = cy + (cy - prevCy)
          } else {
            cpx = cx; cpy = cy
          }
          cx = p[0]; cy = p[1]
          result.push({ type: 'Q', params: [cpx, cpy, cx, cy] })
          prevCmdType = 'T'
          break
        }

        case 't': {
          let cpx: number, cpy: number
          if (prevCmdType === 'Q' || prevCmdType === 'T') {
            cpx = cx + (cx - prevCx)
            cpy = cy + (cy - prevCy)
          } else {
            cpx = cx; cpy = cy
          }
          cx += p[0]; cy += p[1]
          result.push({ type: 'Q', params: [cpx, cpy, cx, cy] })
          prevCmdType = 'T'
          break
        }

        case 'A': {
          const [rx, ry, rotation, largeArc, sweep, ex, ey] = p
          cx = ex; cy = ey
          result.push({ type: 'A', params: [rx, ry, rotation, largeArc, sweep, cx, cy] })
          prevCmdType = 'A'
          break
        }

        case 'a': {
          const [rx, ry, rotation, largeArc, sweep, dx, dy] = p
          cx += dx; cy += dy
          result.push({ type: 'A', params: [rx, ry, rotation, largeArc, sweep, cx, cy] })
          prevCmdType = 'A'
          break
        }

        case 'Z':
        case 'z':
          cx = sx; cy = sy
          result.push({ type: 'Z', params: [] })
          prevCmdType = 'Z'
          break

        default:
          result.push(cmd)
          prevCmdType = cmd.type
          break
      }
    }

    return result
  }

  /**
   * 将 path 命令转换为 PPTX geometry 字符串
   * 此时所有命令已转为绝对坐标（大写）
   * 对所有点应用完整的仿射变换矩阵（包括缩放/旋转/倾斜/平移）
   * bboxOffset 用于将几何坐标偏移为相对于 rect 左上角的相对坐标
   */
  private pathToGeometry(
    commands: PathCommand[],
    mapper: CoordinateMapper,
    transform: TransformMatrix,
    bboxOffset?: { x: number; y: number }
  ): string {
    const parts: string[] = []
    let currentX = 0
    let currentY = 0
    let startX = 0
    let startY = 0

    for (const cmd of commands) {
      const params = cmd.params
      const type = cmd.type

      switch (type) {
        case 'M': {
          currentX = params[0]
          currentY = params[1]
          startX = currentX
          startY = currentY
          const tp = TransformParser.applyTransformToPoint(transform, { x: currentX, y: currentY })
          const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
          const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
          parts.push(`M ${mapper.pxToInch(px)},${mapper.pxToInch(py)}`)
          break
        }

        case 'L': {
          currentX = params[0]
          currentY = params[1]
          const tp = TransformParser.applyTransformToPoint(transform, { x: currentX, y: currentY })
          const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
          const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
          parts.push(`L ${mapper.pxToInch(px)},${mapper.pxToInch(py)}`)
          break
        }

        case 'H': {
          currentX = params[0]
          const tp = TransformParser.applyTransformToPoint(transform, { x: currentX, y: currentY })
          const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
          const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
          parts.push(`L ${mapper.pxToInch(px)},${mapper.pxToInch(py)}`)
          break
        }

        case 'V': {
          currentY = params[0]
          const tp = TransformParser.applyTransformToPoint(transform, { x: currentX, y: currentY })
          const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
          const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
          parts.push(`L ${mapper.pxToInch(px)},${mapper.pxToInch(py)}`)
          break
        }

        case 'C': {
          const points = this.sampleCubicBezier(
            { x: currentX, y: currentY },
            { x: params[0], y: params[1] },
            { x: params[2], y: params[3] },
            { x: params[4], y: params[5] }
          )
          for (const pt of points) {
            const tp = TransformParser.applyTransformToPoint(transform, pt)
            const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
            const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
            parts.push(`L ${mapper.pxToInch(px)},${mapper.pxToInch(py)}`)
          }
          currentX = params[4]
          currentY = params[5]
          break
        }

        case 'Q': {
          const points = this.sampleQuadraticBezier(
            { x: currentX, y: currentY },
            { x: params[0], y: params[1] },
            { x: params[2], y: params[3] }
          )
          for (const pt of points) {
            const tp = TransformParser.applyTransformToPoint(transform, pt)
            const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
            const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
            parts.push(`L ${mapper.pxToInch(px)},${mapper.pxToInch(py)}`)
          }
          currentX = params[2]
          currentY = params[3]
          break
        }

        case 'A': {
          // 将弧线段采样为折线
          // sampleArc 需要原始空间中的终点，所以不变换终点
          const arcPoints = this.sampleArc(
            { x: currentX, y: currentY },
            params[0], params[1], params[2], params[3], params[4],
            params[5], params[6]
          )
          for (const pt of arcPoints) {
            const tp = TransformParser.applyTransformToPoint(transform, pt)
            const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
            const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
            parts.push(`L ${mapper.pxToInch(px)},${mapper.pxToInch(py)}`)
          }
          currentX = params[5]
          currentY = params[6]
          break
        }

        case 'Z': {
          const tp = TransformParser.applyTransformToPoint(transform, { x: startX, y: startY })
          const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
          const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
          parts.push(`L ${mapper.pxToInch(px)},${mapper.pxToInch(py)}`)
          currentX = startX
          currentY = startY
          break
        }

        default: {
          // 其他命令简化处理为直线
          if (params.length >= 2) {
            currentX = params[params.length - 2]
            currentY = params[params.length - 1]
            const tp = TransformParser.applyTransformToPoint(transform, { x: currentX, y: currentY })
            const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
            const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
            parts.push(`L ${mapper.pxToInch(px)},${mapper.pxToInch(py)}`)
          }
          break
        }
      }
    }

    return parts.join(' ')
  }

  /**
   * 将 path 命令转换为 PPTX 自定义几何 points 数组
   * 用于 custGeom 形状
   * 此时所有命令已转为绝对坐标（大写）
   * 对所有点应用完整的仿射变换矩阵（包括缩放/旋转/倾斜/平移）
   * bboxOffset 用于将几何坐标偏移为相对于 rect 左上角的相对坐标
   */
  private pathToPoints(
    commands: PathCommand[],
    mapper: CoordinateMapper,
    transform: TransformMatrix,
    bboxOffset?: { x: number; y: number }
  ): Array<{x: number; y: number; moveTo?: boolean; close?: boolean}> {
    const points: Array<{x: number; y: number; moveTo?: boolean; close?: boolean}> = []
    let currentX = 0
    let currentY = 0
    let startX = 0
    let startY = 0

    for (const cmd of commands) {
      const params = cmd.params
      const type = cmd.type

      switch (type) {
        case 'M': {
          currentX = params[0]
          currentY = params[1]
          startX = currentX
          startY = currentY
          const tp = TransformParser.applyTransformToPoint(transform, { x: currentX, y: currentY })
          const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
          const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
          // 转换为英寸
          points.push({
            x: mapper.pxToInch(px),
            y: mapper.pxToInch(py),
            moveTo: true
          })
          break
        }

        case 'L': {
          currentX = params[0]
          currentY = params[1]
          const tp = TransformParser.applyTransformToPoint(transform, { x: currentX, y: currentY })
          const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
          const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
          points.push({ x: mapper.pxToInch(px), y: mapper.pxToInch(py) })
          break
        }

        case 'H': {
          currentX = params[0]
          const tp = TransformParser.applyTransformToPoint(transform, { x: currentX, y: currentY })
          const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
          const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
          points.push({ x: mapper.pxToInch(px), y: mapper.pxToInch(py) })
          break
        }

        case 'V': {
          currentY = params[0]
          const tp = TransformParser.applyTransformToPoint(transform, { x: currentX, y: currentY })
          const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
          const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
          points.push({ x: mapper.pxToInch(px), y: mapper.pxToInch(py) })
          break
        }

        case 'C': {
          const sampled = this.sampleCubicBezier(
            { x: currentX, y: currentY },
            { x: params[0], y: params[1] },
            { x: params[2], y: params[3] },
            { x: params[4], y: params[5] }
          )
          for (const pt of sampled) {
            const tp = TransformParser.applyTransformToPoint(transform, pt)
            const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
            const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
            points.push({ x: mapper.pxToInch(px), y: mapper.pxToInch(py) })
          }
          currentX = params[4]
          currentY = params[5]
          break
        }

        case 'Q': {
          const sampled = this.sampleQuadraticBezier(
            { x: currentX, y: currentY },
            { x: params[0], y: params[1] },
            { x: params[2], y: params[3] }
          )
          for (const pt of sampled) {
            const tp = TransformParser.applyTransformToPoint(transform, pt)
            const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
            const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
            points.push({ x: mapper.pxToInch(px), y: mapper.pxToInch(py) })
          }
          currentX = params[2]
          currentY = params[3]
          break
        }

        case 'A': {
          const arcPoints = this.sampleArc(
            { x: currentX, y: currentY },
            params[0], params[1], params[2], params[3], params[4],
            params[5], params[6]
          )
          for (const pt of arcPoints) {
            const tp = TransformParser.applyTransformToPoint(transform, pt)
            const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
            const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
            points.push({ x: mapper.pxToInch(px), y: mapper.pxToInch(py) })
          }
          currentX = params[5]
          currentY = params[6]
          break
        }

        case 'Z': {
          const tp = TransformParser.applyTransformToPoint(transform, { x: startX, y: startY })
          const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
          const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
          points.push({ x: mapper.pxToInch(px), y: mapper.pxToInch(py), close: true })
          currentX = startX
          currentY = startY
          break
        }

        default: {
          if (params.length >= 2) {
            currentX = params[params.length - 2]
            currentY = params[params.length - 1]
            const tp = TransformParser.applyTransformToPoint(transform, { x: currentX, y: currentY })
            const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
            const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
            points.push({ x: mapper.pxToInch(px), y: mapper.pxToInch(py) })
          }
          break
        }
      }
    }

    return points
  }

  /**
   * 三次贝塞尔曲线采样
   */
  private sampleCubicBezier(
    start: Point,
    cp1: Point,
    cp2: Point,
    end: Point
  ): Point[] {
    const points: Point[] = []
    const steps = 20
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const x = this.cubicBezier(start.x, cp1.x, cp2.x, end.x, t)
      const y = this.cubicBezier(start.y, cp1.y, cp2.y, end.y, t)
      points.push({ x, y })
    }
    return points
  }

  /**
   * 三次贝塞尔曲线公式
   */
  private cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const mt = 1 - t
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
  }

  /**
   * 二次贝塞尔曲线采样
   */
  private sampleQuadraticBezier(
    start: Point,
    cp: Point,
    end: Point
  ): Point[] {
    const points: Point[] = []
    const steps = 20
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const x = this.quadraticBezier(start.x, cp.x, end.x, t)
      const y = this.quadraticBezier(start.y, cp.y, end.y, t)
      points.push({ x, y })
    }
    return points
  }

  /**
   * 二次贝塞尔曲线公式
   */
  private quadraticBezier(p0: number, p1: number, p2: number, t: number): number {
    const mt = 1 - t
    return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2
  }

  /**
   * 采样 SVG 弧线 (A 命令) 为线段端点数组
   * 参数: start, rx, ry, xAxisRotation, largeArc, sweep, endX, endY
   */
  private sampleArc(
    start: Point,
    rx: number, ry: number, rotation: number,
    largeArc: number, sweep: number,
    endX: number, endY: number
  ): Point[] {
    const points: Point[] = []

    // 如果起点和终点非常接近，且是大弧，视为完整圆
    if (Math.abs(start.x - endX) < 0.001 && Math.abs(start.y - endY) < 0.001) {
      if (largeArc) {
        // 对于 rx≈ry 的圆形弧，起点和终点重合意味着是完整圆
        // 圆心不在起点，而是在起点沿半径方向的内侧
        // 对于以原点为中心的圆，起点在 (r,0)，圆心在 (0,0)
        // 一般情况：从起点到圆心的向量与起点处的法线方向一致
        const r = Math.max(rx, ry)
        // 圆心 = 起点 - 半径方向的单位向量 * r
        // 对于标准位置（起点在 (r,0)），圆心在 (0,0)
        // 通用方法：圆心在起点减去 (rx*cos(0), ry*sin(0)) = (rx, 0)
        const centerX = start.x - rx
        const centerY = start.y
        // 从圆心出发采样整个圆周
        const steps = 48
        for (let i = 1; i <= steps; i++) {
          const angle = (2 * Math.PI * i) / steps
          const px = centerX + rx * Math.cos(angle)
          const py = centerY + ry * Math.sin(angle)
          points.push({ x: px, y: py })
        }
      }
      return points
    }

    // 半径为 0 时退化为直线
    if (rx < 0.001 || ry < 0.001) {
      points.push({ x: endX, y: endY })
      return points
    }

    // 确保 rx, ry 为正
    rx = Math.abs(rx)
    ry = Math.abs(ry)

    // 将坐标转换到椭圆坐标系
    const phi = (rotation * Math.PI) / 180
    const cosPhi = Math.cos(phi)
    const sinPhi = Math.sin(phi)

    const dx2 = (start.x - endX) / 2
    const dy2 = (start.y - endY) / 2
    const x1p = cosPhi * dx2 + sinPhi * dy2
    const y1p = -sinPhi * dx2 + cosPhi * dy2

    // 修正半径以确保弧线存在
    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if (lambda > 1) {
      const sqrtLambda = Math.sqrt(lambda)
      rx *= sqrtLambda
      ry *= sqrtLambda
    }

    // 计算椭圆中心
    const sign = largeArc === sweep ? -1 : 1
    const sq = (rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p) /
               (rx * rx * y1p * y1p + ry * ry * x1p * x1p)
    const sqRoot = Math.sqrt(Math.max(0, sq))
    const cxp = sign * sqRoot * rx * y1p / ry
    const cyp = -sign * sqRoot * ry * x1p / rx

    const cx = cosPhi * cxp - sinPhi * cyp + (start.x + endX) / 2
    const cy = sinPhi * cxp + cosPhi * cyp + (start.y + endY) / 2

    // 计算起始角度和角度范围
    const vx = (x1p - cxp) / rx
    const vy = (y1p - cyp) / ry
    const startAngle = Math.atan2(vy, vx)

    const wvx = (-x1p - cxp) / rx
    const wvy = (-y1p - cyp) / ry
    let deltaAngle = Math.atan2(wvy, wvx) - startAngle

    if (!sweep && deltaAngle > 0) deltaAngle -= 2 * Math.PI
    if (sweep && deltaAngle < 0) deltaAngle += 2 * Math.PI

    // 采样弧线 - 增加采样密度以获得更平滑的曲线
    // 使用每 2 度至少一个采样点的密度
    const steps = Math.max(32, Math.ceil(Math.abs(deltaAngle) * 180 / (2 * Math.PI) / 2))
    for (let i = 1; i <= steps; i++) {
      const t = startAngle + (deltaAngle * i) / steps
      const ex = cosPhi * rx * Math.cos(t) - sinPhi * ry * Math.sin(t) + cx
      const ey = sinPhi * rx * Math.cos(t) + cosPhi * ry * Math.sin(t) + cy
      points.push({ x: ex, y: ey })
    }

    return points
  }

  /**
   * 计算路径的包围盒
   * 此时所有命令已转为绝对坐标
   * 对 A 命令采样得到实际路径点，并应用完整变换矩阵
   */
  private getBbox(commands: PathCommand[], transform: TransformMatrix): { x: number; y: number; w: number; h: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let cx = 0, cy = 0

    const considerPoint = (x: number, y: number) => {
      const tp = TransformParser.applyTransformToPoint(transform, { x, y })
      if (isFinite(tp.x)) { minX = Math.min(minX, tp.x); maxX = Math.max(maxX, tp.x) }
      if (isFinite(tp.y)) { minY = Math.min(minY, tp.y); maxY = Math.max(maxY, tp.y) }
    }

    for (const cmd of commands) {
      switch (cmd.type) {
        case 'M':
          cx = cmd.params[0] || 0
          cy = cmd.params[1] || 0
          considerPoint(cx, cy)
          break
        case 'L':
          cx = cmd.params[0] || cx
          cy = cmd.params[1] !== undefined ? cmd.params[1] : cy
          considerPoint(cx, cy)
          break
        case 'H':
          cx = cmd.params[0] || cx
          considerPoint(cx, cy)
          break
        case 'V':
          cy = cmd.params[0] || cy
          considerPoint(cx, cy)
          break
        case 'C': {
          // 采样贝塞尔曲线
          const points = this.sampleCubicBezier(
            { x: cx, y: cy },
            { x: cmd.params[0], y: cmd.params[1] },
            { x: cmd.params[2], y: cmd.params[3] },
            { x: cmd.params[4], y: cmd.params[5] }
          )
          for (const p of points) considerPoint(p.x, p.y)
          cx = cmd.params[4] || cx
          cy = cmd.params[5] !== undefined ? cmd.params[5] : cy
          break
        }
        case 'Q': {
          const points = this.sampleQuadraticBezier(
            { x: cx, y: cy },
            { x: cmd.params[0], y: cmd.params[1] },
            { x: cmd.params[2], y: cmd.params[3] }
          )
          for (const p of points) considerPoint(p.x, p.y)
          cx = cmd.params[2] || cx
          cy = cmd.params[3] !== undefined ? cmd.params[3] : cy
          break
        }
        case 'A': {
          const arcPoints = this.sampleArc(
            { x: cx, y: cy },
            cmd.params[0], cmd.params[1], cmd.params[2],
            cmd.params[3], cmd.params[4], cmd.params[5], cmd.params[6]
          )
          for (const p of arcPoints) considerPoint(p.x, p.y)
          cx = cmd.params[5] || cx
          cy = cmd.params[6] !== undefined ? cmd.params[6] : cy
          break
        }
        case 'Z':
          break
      }
    }

    return {
      x: minX === Infinity ? 0 : minX,
      y: minY === Infinity ? 0 : minY,
      w: maxX === -Infinity ? 0 : maxX - minX,
      h: maxY === -Infinity ? 0 : maxY - minY
    }
  }

  /**
   * 将 path 命令转换为带曲线信息的 points 数组
   * 支持 Cubic 和 Quadratic 贝塞尔曲线
   * 使用 PPTX 的 curve 属性而不是采样成直线
   */
  private pathToPointsWithCurves(
    commands: PathCommand[],
    mapper: CoordinateMapper,
    transform: TransformMatrix,
    bboxOffset?: { x: number; y: number }
  ): Array<{x: number; y: number; moveTo?: boolean; close?: boolean; curve?: any}> {
    const points: Array<{x: number; y: number; moveTo?: boolean; close?: boolean; curve?: any}> = []
    let currentX = 0
    let currentY = 0
    let startX = 0
    let startY = 0

    for (const cmd of commands) {
      const params = cmd.params
      const type = cmd.type

      switch (type) {
        case 'M': {
          currentX = params[0]
          currentY = params[1]
          startX = currentX
          startY = currentY
          const tp = TransformParser.applyTransformToPoint(transform, { x: currentX, y: currentY })
          const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
          const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
          points.push({
            x: mapper.pxToInch(px),
            y: mapper.pxToInch(py),
            moveTo: true
          })
          break
        }

        case 'L': {
          currentX = params[0]
          currentY = params[1]
          const tp = TransformParser.applyTransformToPoint(transform, { x: currentX, y: currentY })
          const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
          const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
          points.push({ x: mapper.pxToInch(px), y: mapper.pxToInch(py) })
          break
        }

        case 'H': {
          currentX = params[0]
          const tp = TransformParser.applyTransformToPoint(transform, { x: currentX, y: currentY })
          const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
          const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
          points.push({ x: mapper.pxToInch(px), y: mapper.pxToInch(py) })
          break
        }

        case 'V': {
          currentY = params[0]
          const tp = TransformParser.applyTransformToPoint(transform, { x: currentX, y: currentY })
          const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
          const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
          points.push({ x: mapper.pxToInch(px), y: mapper.pxToInch(py) })
          break
        }

        case 'C': {
          // Cubic Bezier: C cp1x cp1y cp2x cp2y endx endy
          const cp1x = params[0], cp1y = params[1]
          const cp2x = params[2], cp2y = params[3]
          const endX = params[4], endY = params[5]

          // 变换控制点和终点
          const tp1 = TransformParser.applyTransformToPoint(transform, { x: cp1x, y: cp1y })
          const tp2 = TransformParser.applyTransformToPoint(transform, { x: cp2x, y: cp2y })
          const tEnd = TransformParser.applyTransformToPoint(transform, { x: endX, y: endY })

          // 计算相对于 bbox 的坐标
          const p1x = bboxOffset ? tp1.x - bboxOffset.x : tp1.x
          const p1y = bboxOffset ? tp1.y - bboxOffset.y : tp1.y
          const p2x = bboxOffset ? tp2.x - bboxOffset.x : tp2.x
          const p2y = bboxOffset ? tp2.y - bboxOffset.y : tp2.y
          const ex = bboxOffset ? tEnd.x - bboxOffset.x : tEnd.x
          const ey = bboxOffset ? tEnd.y - bboxOffset.y : tEnd.y

          points.push({
            x: mapper.pxToInch(ex),
            y: mapper.pxToInch(ey),
            curve: {
              type: 'cubic',
              x1: mapper.pxToInch(p1x),
              y1: mapper.pxToInch(p1y),
              x2: mapper.pxToInch(p2x),
              y2: mapper.pxToInch(p2y)
            }
          })

          currentX = endX
          currentY = endY
          break
        }

        case 'Q': {
          // Quadratic Bezier: Q cpx cpy endx endy
          const cpx = params[0], cpy = params[1]
          const endX = params[2], endY = params[3]

          // 变换控制点和终点
          const tp = TransformParser.applyTransformToPoint(transform, { x: cpx, y: cpy })
          const tEnd = TransformParser.applyTransformToPoint(transform, { x: endX, y: endY })

          // 计算相对于 bbox 的坐标
          const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
          const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
          const ex = bboxOffset ? tEnd.x - bboxOffset.x : tEnd.x
          const ey = bboxOffset ? tEnd.y - bboxOffset.y : tEnd.y

          points.push({
            x: mapper.pxToInch(ex),
            y: mapper.pxToInch(ey),
            curve: {
              type: 'quadratic',
              x1: mapper.pxToInch(px),
              y1: mapper.pxToInch(py)
            }
          })

          currentX = endX
          currentY = endY
          break
        }

        case 'A': {
          // 弧线采样为折线（PPTX 的 arc curve 类型较难与 SVG 弧匹配）
          const arcPoints = this.sampleArc(
            { x: currentX, y: currentY },
            params[0], params[1], params[2], params[3], params[4],
            params[5], params[6]
          )
          for (const pt of arcPoints) {
            const tp = TransformParser.applyTransformToPoint(transform, pt)
            const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
            const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
            points.push({ x: mapper.pxToInch(px), y: mapper.pxToInch(py) })
          }
          currentX = params[5]
          currentY = params[6]
          break
        }

        case 'Z': {
          const tp = TransformParser.applyTransformToPoint(transform, { x: startX, y: startY })
          const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
          const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
          points.push({ x: mapper.pxToInch(px), y: mapper.pxToInch(py), close: true })
          currentX = startX
          currentY = startY
          break
        }

        default: {
          if (params.length >= 2) {
            currentX = params[params.length - 2]
            currentY = params[params.length - 1]
            const tp = TransformParser.applyTransformToPoint(transform, { x: currentX, y: currentY })
            const px = bboxOffset ? tp.x - bboxOffset.x : tp.x
            const py = bboxOffset ? tp.y - bboxOffset.y : tp.y
            points.push({ x: mapper.pxToInch(px), y: mapper.pxToInch(py) })
          }
          break
        }
      }
    }

    return points
  }
}
