import { TransformMatrix, Point } from '../types'

export class TransformParser {
  /** 单位矩阵 */
  static identity(): TransformMatrix {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  }

  /**
   * 解析 SVG transform 属性字符串为 TransformMatrix
   */
  static parseTransform(transformStr: string): TransformMatrix {
    if (!transformStr || transformStr.trim() === '') {
      return this.identity()
    }

    const transforms = this.extractTransformFunctions(transformStr)
    return transforms.reduce(
      (acc, tf) => this.multiplyTransforms(acc, tf),
      this.identity()
    )
  }

  /**
   * 两个变换矩阵相乘
   */
  static multiplyTransforms(t1: TransformMatrix, t2: TransformMatrix): TransformMatrix {
    // t2 在 t1 之后应用 (SVG 变换顺序)
    return {
      a: t2.a * t1.a + t2.c * t1.b,
      b: t2.b * t1.a + t2.d * t1.b,
      c: t2.a * t1.c + t2.c * t1.d,
      d: t2.b * t1.c + t2.d * t1.d,
      e: t2.a * t1.e + t2.c * t1.f + t2.e,
      f: t2.b * t1.e + t2.d * t1.f + t2.f
    }
  }

  /**
   * 将变换应用到点
   */
  static applyTransformToPoint(transform: TransformMatrix, point: Point): Point {
    return {
      x: transform.a * point.x + transform.c * point.y + transform.e,
      y: transform.b * point.x + transform.d * point.y + transform.f
    }
  }

  private static extractTransformFunctions(transformStr: string): TransformMatrix[] {
    const results: TransformMatrix[] = []
    const regex = /(translate|scale|rotate|skewX|skewY|matrix)\(([^)]*)\)/g
    let match

    while ((match = regex.exec(transformStr)) !== null) {
      const fn = match[1]
      const params = match[2].split(/[\s,]+/).map(s => parseFloat(s.trim())).filter(n => !isNaN(n))

      switch (fn) {
        case 'translate':
          results.push(this.translate(params[0] || 0, params[1] || 0))
          break
        case 'scale':
          results.push(this.scale(params[0] || 1, (params[1] ?? params[0]) || 1))
          break
        case 'rotate':
          results.push(this.rotate(params[0] || 0))
          break
        case 'skewX':
          results.push(this.skewX(params[0] || 0))
          break
        case 'skewY':
          results.push(this.skewY(params[0] || 0))
          break
        case 'matrix':
          results.push({
            a: params[0], b: params[1], c: params[2],
            d: params[3], e: params[4], f: params[5]
          })
          break
      }
    }

    return results
  }

  private static translate(tx: number, ty: number): TransformMatrix {
    return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty }
  }

  private static scale(sx: number, sy: number): TransformMatrix {
    return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 }
  }

  private static rotate(angleDeg: number): TransformMatrix {
    const rad = (angleDeg * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
  }

  private static skewX(angleDeg: number): TransformMatrix {
    const tan = Math.tan((angleDeg * Math.PI) / 180)
    return { a: 1, b: 0, c: tan, d: 1, e: 0, f: 0 }
  }

  private static skewY(angleDeg: number): TransformMatrix {
    const tan = Math.tan((angleDeg * Math.PI) / 180)
    return { a: 1, b: tan, c: 0, d: 1, e: 0, f: 0 }
  }
}
