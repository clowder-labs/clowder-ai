import PptxGenJS from 'pptxgenjs'

/**
 * 幻灯片尺寸接口
 */
export interface SlideDimensions {
  width: number
  height: number
}

/**
 * PPTX 构建器 - PptxGenJS 的封装
 */
export class PPTXBuilder {
  /**
   * 创建新的 PPTX 演示文稿实例
   */
  createPresentation(): PptxGenJS {
    return new PptxGenJS()
  }

  /**
   * 向演示文稿中添加幻灯片
   * @param pptx - PptxGenJS 实例
   * @param dimensions - 幻灯片尺寸
   */
  addSlide(pptx: PptxGenJS, dimensions: SlideDimensions): PptxGenJS.Slide {
    // 定义与 SVG 画布匹配的自定义布局
    pptx.defineLayout({ name: 'SVG_CUSTOM', width: dimensions.width, height: dimensions.height })
    pptx.layout = 'SVG_CUSTOM'
    const slide = pptx.addSlide()
    return slide
  }

  /**
   * 将转换后的对象数组批量添加到幻灯片
   * @param slide - 幻灯片实例
   * @param objects - 对象数组（包含 rect, text, ellipse 等类型）
   */
  addObjects(
    slide: PptxGenJS.Slide,
    objects: Record<string, any>[]
  ): void {
    for (const obj of objects) {
      this.addObject(slide, obj)
    }
  }

  /**
   * 将单个对象添加到幻灯片
   * @param slide - 幻灯片实例
   * @param obj - 对象配置
   */
  private addObject(slide: PptxGenJS.Slide, obj: Record<string, any>): void {
    switch (obj.type) {
      case 'rect':
        // 有圆角时使用 roundRect，否则使用普通 rect
        if (obj.rectRadius) {
          slide.addShape('roundRect', obj)
        } else {
          slide.addShape('rect', obj)
        }
        break
      case 'ellipse':
        slide.addShape('ellipse', obj)
        break
      case 'line':
        slide.addShape('line', obj)
        break
      case 'polyline':
        slide.addShape('polyline' as any, obj)
        break
      case 'custGeom':
        slide.addShape('custGeom' as any, obj)
        break
      case 'text':
        slide.addText(obj.text || '', obj)
        break
      case 'image':
        slide.addImage({
          path: obj.path,
          x: obj.x,
          y: obj.y,
          w: obj.w,
          h: obj.h,
          ...(obj.line ? { line: obj.line, lineSize: obj.lineSize } : {})
        })
        break
      default:
        console.warn(`Unknown object type: ${obj.type}`)
    }
  }
}
