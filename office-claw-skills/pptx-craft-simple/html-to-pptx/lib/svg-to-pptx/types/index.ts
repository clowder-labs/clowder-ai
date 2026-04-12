// src/types/index.ts

// SVG 元素节点抽象
export interface SVGElementNode {
  type: string
  attributes: Record<string, string>
  children: SVGElementNode[]
  transform?: TransformMatrix
  style: StyleProperties
  textContent?: string  // 文本元素的文本内容
}

// 变换矩阵 (3x3, 使用 6 个有效值)
export interface TransformMatrix {
  a: number  // scaleX
  b: number  // skewY
  c: number  // skewX
  d: number  // scaleY
  e: number  // translateX
  f: number  // translateY
}

// 样式属性
export interface StyleProperties {
  fill?: string
  stroke?: string
  strokeWidth?: number
  strokeDasharray?: string
  opacity?: number
  fontSize?: number
  fontFamily?: string
  fontWeight?: string
  textAlign?: string
  [key: string]: string | number | undefined
}

// 颜色定义
export interface ColorRGBA {
  r: number
  g: number
  b: number
  a: number
}

// 渐变停止点
export interface GradientStop {
  offset: number  // 0-1
  color: ColorRGBA
}

// 线性渐变
export interface LinearGradient {
  type: 'linear'
  x1: number
  y1: number
  x2: number
  y2: number
  stops: GradientStop[]
}

// 径向渐变
export interface RadialGradient {
  type: 'radial'
  cx: number
  cy: number
  r: number
  stops: GradientStop[]
}

export type Gradient = LinearGradient | RadialGradient

// 坐标点
export interface Point {
  x: number
  y: number
}

// 路径命令类型（包含大小写，相对命令在 parsePath 中转为绝对命令）
export type PathCommandType =
  | 'M' | 'm' | 'L' | 'l' | 'H' | 'h' | 'V' | 'v'
  | 'C' | 'c' | 'S' | 's' | 'Q' | 'q' | 'T' | 't'
  | 'A' | 'a' | 'Z' | 'z'

// 路径命令
export interface PathCommand {
  type: PathCommandType
  params: number[]
}

// 转换器配置
export interface ConverterConfig {
  /** SVG px 到 PPTX inches 的转换比率,默认 96px = 1inch */
  pxToInch?: number
  /** 幻灯片宽度,默认 'auto' 使用 SVG 宽度 */
  slideWidth?: number | 'auto'
  /** 幻灯片高度,默认 'auto' 使用 SVG 高度 */
  slideHeight?: number | 'auto'
}

// 转换结果
export interface ConversionResult {
  pptx: any  // PptxGenJS 实例
  slide: any // PptxGenJS Slide 实例
}
