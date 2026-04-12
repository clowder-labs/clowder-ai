import { ImageGeneratorInterface } from '../platform'
import { Gradient } from '../types'

/**
 * 渐变图片生成器
 * 使用注入的图片生成器实现来生成渐变填充图片
 */
export class GradientImageGenerator {
  private impl: ImageGeneratorInterface

  constructor(impl: ImageGeneratorInterface) {
    this.impl = impl
  }

  /**
   * 生成渐变图片
   * @param gradient 渐变定义
   * @param width 图片宽度
   * @param height 图片高度
   * @param gradientId 渐变ID（用于生成唯一文件名）
   * @returns 生成的图片路径
   */
  async generateGradientImage(
    gradient: Gradient,
    width: number,
    height: number,
    gradientId: string
  ): Promise<string> {
    return this.impl.generateGradientImage(gradient, width, height, gradientId)
  }

  /**
   * 清理临时资源
   */
  cleanup(): void {
    this.impl.cleanup()
  }
}
