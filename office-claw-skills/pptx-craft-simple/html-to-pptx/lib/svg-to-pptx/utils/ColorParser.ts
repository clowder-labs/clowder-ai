import { ColorRGBA } from '../types'

interface SolidFill {
  type: 'solid'
  color: ColorRGBA
}

export type FillResult = SolidFill | null

// 命名颜色映射（常用 SVG 颜色）
const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  silver: '#c0c0c0',
  gray: '#808080',
  grey: '#808080',
  orange: '#ffa500',
  purple: '#800080',
  navy: '#000080',
  lime: '#00ff00',
  teal: '#008080',
  maroon: '#800000',
  olive: '#808000',
  pink: '#ffc0cb',
  none: 'transparent'
}

export class ColorParser {
  /**
   * 解析颜色字符串为 ColorRGBA 对象
   */
  static parseColor(colorStr: string): ColorRGBA | null {
    if (!colorStr || colorStr === 'none' || colorStr === 'transparent') {
      return null
    }

    const normalized = colorStr.trim().toLowerCase()

    // 处理 named color
    if (NAMED_COLORS[normalized]) {
      return this.parseColor(NAMED_COLORS[normalized])
    }

    // 处理 hex
    if (normalized.startsWith('#')) {
      return this.parseHexColor(normalized)
    }

    // 处理 rgb/rgba
    if (normalized.startsWith('rgb')) {
      return this.parseRgbFunction(normalized)
    }

    return null
  }

  /**
   * 将 ColorRGBA 转换为 PPTX 使用的十六进制字符串
   */
  static colorToPptxHex(color: ColorRGBA): string {
    const r = color.r.toString(16).padStart(2, '0')
    const g = color.g.toString(16).padStart(2, '0')
    const b = color.b.toString(16).padStart(2, '0')
    return `${r}${g}${b}`.toUpperCase()
  }

  /**
   * 解析 fill 属性值
   */
  static parseFill(value: string): FillResult {
    if (!value || value === 'none' || value === 'transparent') {
      return null
    }

    // url() 引用的渐变由调用方处理
    if (value.startsWith('url(')) {
      return null
    }

    const color = this.parseColor(value)
    if (color) {
      return { type: 'solid', color }
    }

    return null
  }

  private static parseHexColor(hex: string): ColorRGBA | null {
    let r: number, g: number, b: number

    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16)
      g = parseInt(hex[2] + hex[2], 16)
      b = parseInt(hex[3] + hex[3], 16)
    } else if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16)
      g = parseInt(hex.slice(3, 5), 16)
      b = parseInt(hex.slice(5, 7), 16)
    } else {
      return null
    }

    return { r, g, b, a: 1 }
  }

  private static parseRgbFunction(str: string): ColorRGBA | null {
    const match = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/)
    if (!match) {
      return null
    }

    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
      a: match[4] ? parseFloat(match[4]) : 1
    }
  }
}
