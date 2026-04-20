// src/platform/node/ImageGeneratorImpl.ts
import sharp from 'sharp'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ImageGeneratorInterface } from '../ImageGenerator'
import { Gradient } from '../../types'

export class NodeImageGenerator implements ImageGeneratorInterface {
  private tempDir: string
  private generatedImages: Set<string>

  constructor() {
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svg-to-pptx-gradient-'))
    this.generatedImages = new Set()
  }

  async generateGradientImage(
    gradient: Gradient,
    width: number,
    height: number,
    gradientId: string
  ): Promise<string> {
    const filename = `${gradientId}_${width}x${height}.png`
    const outputPath = path.join(this.tempDir, filename)

    if (this.generatedImages.has(outputPath)) {
      return outputPath
    }

    const pixels = this.createGradientPixels(width, height, gradient)

    await sharp(pixels, {
      raw: { width, height, channels: 3 }
    })
      .png()
      .toFile(outputPath)

    this.generatedImages.add(outputPath)
    return outputPath
  }

  private createGradientPixels(width: number, height: number, gradient: Gradient): Buffer {
    const stops = [...gradient.stops].sort((a, b) => a.offset - b.offset)
    const pixels = Buffer.alloc(width * height * 3)

    for (let x = 0; x < width; x++) {
      const offset = x / (width - 1 || 1)
      const color = this.interpolateColor(stops, offset)

      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 3
        pixels[idx] = color.r
        pixels[idx + 1] = color.g
        pixels[idx + 2] = color.b
      }
    }

    return pixels
  }

  private interpolateColor(
    stops: Array<{ offset: number; color: { r: number; g: number; b: number } }>,
    offset: number
  ): { r: number; g: number; b: number } {
    for (let i = 0; i < stops.length - 1; i++) {
      const s1 = stops[i]
      const s2 = stops[i + 1]

      if (s1.offset <= offset && offset <= s2.offset) {
        if (s2.offset === s1.offset) {
          return { r: s1.color.r, g: s1.color.g, b: s1.color.b }
        }
        const t = (offset - s1.offset) / (s2.offset - s1.offset)
        return {
          r: Math.round(s1.color.r + (s2.color.r - s1.color.r) * t),
          g: Math.round(s1.color.g + (s2.color.g - s1.color.g) * t),
          b: Math.round(s1.color.b + (s2.color.b - s1.color.b) * t)
        }
      }
    }

    if (offset <= stops[0].offset) {
      return { r: stops[0].color.r, g: stops[0].color.g, b: stops[0].color.b }
    }
    const last = stops[stops.length - 1]
    return { r: last.color.r, g: last.color.g, b: last.color.b }
  }

  cleanup(): void {
    try {
      fs.rmSync(this.tempDir, { recursive: true, force: true })
    } catch (e) {
      // 忽略清理错误
    }
  }
}