import { Point } from '../types'

export interface MappedRect {
  x: number
  y: number
  w: number
  h: number
}

export interface MappedCircle {
  cx: number
  cy: number
  r: number
}

export interface RawRect {
  x: number
  y: number
  w: number
  h: number
}

export interface RawCircle {
  cx: number
  cy: number
  r: number
}

export class CoordinateMapper {
  private static readonly DEFAULT_PX_PER_INCH = 96
  private pxPerInch: number

  constructor(pxPerInch: number = CoordinateMapper.DEFAULT_PX_PER_INCH) {
    this.pxPerInch = pxPerInch
  }

  /**
   * 将 SVG px 值转换为 PPTX inches
   */
  pxToInch(px: number): number {
    return px / this.pxPerInch
  }

  /**
   * 转换矩形坐标
   */
  mapRect(rect: RawRect): MappedRect {
    return {
      x: this.pxToInch(rect.x),
      y: this.pxToInch(rect.y),
      w: this.pxToInch(rect.w),
      h: this.pxToInch(rect.h)
    }
  }

  /**
   * 转换圆形坐标
   */
  mapCircle(circle: RawCircle): MappedCircle {
    return {
      cx: this.pxToInch(circle.cx),
      cy: this.pxToInch(circle.cy),
      r: this.pxToInch(circle.r)
    }
  }

  /**
   * 转换点坐标
   */
  mapPoint(point: Point): Point {
    return {
      x: this.pxToInch(point.x),
      y: this.pxToInch(point.y)
    }
  }
}
