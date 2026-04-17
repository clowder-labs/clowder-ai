import { SVGElementNode, Gradient } from '../types'
import { CoordinateMapper } from '../utils/CoordinateMapper'
import { TransformParser } from '../utils/TransformParser'
import { ElementConverter } from './ElementConverter'
import { ShapeConverter } from './ShapeConverter'
import { PathConverter } from './PathConverter'
import { TextConverter } from './TextConverter'
import { GradientConverter } from './GradientConverter'

/**
 * 分组转换器
 * 处理 SVG <g> 元素，递归转换子元素并累积 transform
 */
export class GroupConverter extends ElementConverter {
  private converters: Map<string, ElementConverter>
  private gradientConverterInstance: GradientConverter

  constructor() {
    super()
    this.gradientConverterInstance = new GradientConverter()
    this.gradientConverter = this.gradientConverterInstance

    this.converters = new Map()
    this.converters.set('rect', new ShapeConverter())
    this.converters.set('circle', new ShapeConverter())
    this.converters.set('ellipse', new ShapeConverter())
    this.converters.set('line', new ShapeConverter())
    this.converters.set('polygon', new ShapeConverter())
    this.converters.set('polyline', new ShapeConverter())
    this.converters.set('path', new PathConverter())
    this.converters.set('text', new TextConverter())
    this.converters.set('g', this) // 递归引用，支持嵌套 group
  }

  /**
   * 设置渐变定义映射表，并传递给所有子转换器
   */
  setGradients(gradients: Map<string, Gradient>): void {
    this.gradients = gradients
    // 传递给所有子转换器
    for (const converter of this.converters.values()) {
      if (converter !== this) {
        converter.setGradients(gradients)
        converter.setGradientConverter(this.gradientConverterInstance)
      }
    }
  }

  /**
   * 转换 group 元素及其所有子元素
   * @param element SVG group 元素
   * @param mapper 坐标映射器
   * @param parentTransform 父级累积变换矩阵
   */
  async convertElement(
    element: SVGElementNode,
    mapper: CoordinateMapper,
    parentTransform = TransformParser.identity()
  ): Promise<any[]> {
    // 解析当前 group 的 transform
    const groupTransform = TransformParser.parseTransform(element.attributes.transform || '')
    // 与父级变换相乘，得到累积变换
    const effectiveTransform = TransformParser.multiplyTransforms(parentTransform, groupTransform)

    const allChildren: any[] = []

    for (const child of element.children) {
      const converter = this.converters.get(child.type)
      if (converter) {
        // 将累积的 transform 写入子元素的 attributes，让子转换器处理
        const childTransformStr = child.attributes.transform || ''
        const combinedTransform = this.buildTransformString(effectiveTransform, childTransformStr)
        const childWithTransform = {
          ...child,
          attributes: {
            ...child.attributes,
            transform: combinedTransform
          }
        }
        const children = await converter.convertElement(childWithTransform, mapper)
        allChildren.push(...children)
      }
    }

    return allChildren
  }

  /**
   * 将累积的变换矩阵与子元素自身的 transform 合并
   */
  private buildTransformString(effectiveTransform: ReturnType<typeof TransformParser.identity>, childTransform: string): string {
    const childMatrix = TransformParser.parseTransform(childTransform)
    // SVG 变换顺序：子变换先应用，父变换后应用，即 parent × child
    // multiplyTransforms(t1, t2) 计算 t2 × t1（t1 先应用，t2 后应用）
    // 所以要计算 effectiveTransform × childMatrix，传入 (childMatrix, effectiveTransform)
    const combined = TransformParser.multiplyTransforms(childMatrix, effectiveTransform)
    return `matrix(${combined.a},${combined.b},${combined.c},${combined.d},${combined.e},${combined.f})`
  }
}
