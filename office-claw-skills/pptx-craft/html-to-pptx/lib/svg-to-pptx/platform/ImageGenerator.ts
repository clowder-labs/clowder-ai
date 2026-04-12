// src/platform/ImageGenerator.ts
import { Gradient } from '../types'

export interface ImageGeneratorInterface {
  // 生成渐变图片并返回 Data URL (浏览器) 或文件路径 (Node.js)
  generateGradientImage(
    gradient: Gradient,
    width: number,
    height: number,
    gradientId: string
  ): Promise<string>

  // 清理临时资源
  cleanup(): void
}