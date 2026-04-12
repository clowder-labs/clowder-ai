// src/platform/browser/ImageGeneratorImpl.ts
import { ImageGeneratorInterface } from '../ImageGenerator'
import { Gradient } from '../../types'

export class BrowserImageGenerator implements ImageGeneratorInterface {
  private generatedImages: Map<string, string> = new Map()
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null

  private getCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas')
      this.ctx = this.canvas.getContext('2d')!
    }
    return { canvas: this.canvas, ctx: this.ctx! }
  }

  async generateGradientImage(
    gradient: Gradient,
    width: number,
    height: number,
    gradientId: string
  ): Promise<string> {
    const cacheKey = `${gradientId}_${width}x${height}`

    if (this.generatedImages.has(cacheKey)) {
      return this.generatedImages.get(cacheKey)!
    }

    const { canvas, ctx } = this.getCanvas()
    canvas.width = width
    canvas.height = height

    // 根据渐变类型创建 Canvas 渐变
    let canvasGradient: CanvasGradient

    if (gradient.type === 'linear') {
      // 将相对坐标转换为像素坐标
      const x1 = gradient.x1 * width
      const y1 = gradient.y1 * height
      const x2 = gradient.x2 * width
      const y2 = gradient.y2 * height
      canvasGradient = ctx.createLinearGradient(x1, y1, x2, y2)
    } else {
      // 径向渐变
      const cx = gradient.cx * width
      const cy = gradient.cy * height
      const r = gradient.r * Math.max(width, height)
      canvasGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    }

    // 添加渐变停止点
    for (const stop of gradient.stops) {
      const { r, g, b, a } = stop.color
      canvasGradient.addColorStop(stop.offset, `rgba(${r}, ${g}, ${b}, ${a})`)
    }

    // 填充渐变
    ctx.fillStyle = canvasGradient
    ctx.fillRect(0, 0, width, height)

    // 转换为 Data URL
    const dataUrl = canvas.toDataURL('image/png')
    this.generatedImages.set(cacheKey, dataUrl)

    return dataUrl
  }

  cleanup(): void {
    // 清理 Canvas
    this.canvas = null
    this.ctx = null

    // 清理 Data URL 缓存
    this.generatedImages.clear()
  }
}