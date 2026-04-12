// SVG to PPTX 桥接模块 - 将 svg-to-pptx 集成到 html-to-pptx
// 直接导入浏览器平台实现，避免引入 Node.js 依赖

// 静态导入 svg-to-pptx 的浏览器版本（会在构建时被打包）
import { BrowserConverter } from '../../lib/svg-to-pptx/index.browser.ts';

// 缓存 converter 实例
let _converter = null;

function getConverter(pxToInch = 96) {
  if (!_converter) {
    _converter = new BrowserConverter({
      pxToInch: pxToInch,
      slideWidth: 'auto',
      slideHeight: 'auto'
    });
  }
  return _converter;
}

/**
 * 将 SVG DOM 节点转换为可编辑的 PPTX 对象
 * @param {SVGElement} svgNode - SVG DOM 节点
 * @param {Object} position - 位置信息 { x, y, w, h }（单位：inch）
 * @param {number} opacity - 透明度（0-1）
 * @returns {Array} 转换后的 PPTX 对象数组
 */
export async function convertSVGToObjects(svgNode, position, opacity = 1) {
  try {
    // 获取 SVG 的实际渲染尺寸
    const svgRect = svgNode.getBoundingClientRect();
    const svgWidthPx = svgRect.width;
    const svgHeightPx = svgRect.height;

    // 1. 克隆 SVG 节点，避免修改原始 DOM
    const svgClone = svgNode.cloneNode(true);
    svgClone.removeAttribute('style');
    svgClone.removeAttribute('class');

    // 2. 确保 SVG 有正确的 viewBox 属性
    // 如果没有 viewBox，使用渲染尺寸作为 viewBox
    if (!svgClone.getAttribute('viewBox')) {
      svgClone.setAttribute('viewBox', `0 0 ${svgWidthPx} ${svgHeightPx}`);
    }

    // 3. 设置 width/height 属性为渲染尺寸（以像素为单位）
    svgClone.setAttribute('width', String(svgWidthPx));
    svgClone.setAttribute('height', String(svgHeightPx));

    // 4. 序列化 SVG DOM 为字符串
    const svgString = new XMLSerializer().serializeToString(svgClone);

    // 5. 计算 pxToInch 值，使得 svg-to-pptx 输出的尺寸等于目标尺寸
    // svg-to-pptx 输出尺寸 = SVG 像素尺寸 / pxToInch
    // 我们希望：输出尺寸 = position.w/h
    // 所以：pxToInch = SVG 像素尺寸 / position.w/h
    const targetPxToInchX = svgWidthPx / position.w;
    const targetPxToInchY = svgHeightPx / position.h;
    // 使用平均值，保持宽高比
    const targetPxToInch = (targetPxToInchX + targetPxToInchY) / 2;

    // 6. 使用计算出的 pxToInch 创建 converter
    const converter = new BrowserConverter({
      pxToInch: targetPxToInch,
      slideWidth: 'auto',
      slideHeight: 'auto'
    });

    const { objects, dimensions } = await converter.convertToObjects(svgString);

    // 将对象转换为 PPTX 格式并返回
    // 跳过第一个对象（索引 0），它是 SVG 的背景矩形，会遮挡内容
    const resultObjects = [];
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];

      // 跳过背景矩形（通常是第一个对象，覆盖整个 SVG 区域）
      if (i === 0 && obj.type === 'rect' &&
          Math.abs(obj.x) < 0.01 && Math.abs(obj.y) < 0.01 &&
          Math.abs(obj.w - dimensions.width) < 0.01 && Math.abs(obj.h - dimensions.height) < 0.01) {
        continue;
      }
      // 只应用位置偏移，不缩放
      const positionedObj = {
        ...obj,
        x: position.x + (obj.x || 0),
        y: position.y + (obj.y || 0)
      };

      // 应用透明度
      if (opacity < 1) {
        positionedObj.transparency = (1 - opacity) * 100;
      }

      // 根据对象类型转换为 PPTX 格式
      switch (obj.type) {
        case 'rect':
          resultObjects.push({ type: 'shape', shapeType: 'rect', options: positionedObj });
          break;
        case 'ellipse':
          resultObjects.push({ type: 'shape', shapeType: 'ellipse', options: positionedObj });
          break;
        case 'line':
          resultObjects.push({ type: 'shape', shapeType: 'line', options: positionedObj });
          break;
        case 'polyline':
          resultObjects.push({ type: 'shape', shapeType: 'polyline', options: positionedObj });
          break;
        case 'custGeom':
          resultObjects.push({ type: 'shape', shapeType: 'custGeom', options: positionedObj });
          break;
        case 'text':
          resultObjects.push({ type: 'text', text: obj.text || '', options: positionedObj });
          break;
        case 'image':
          resultObjects.push({
            type: 'image',
            options: {
              path: obj.path,
              x: positionedObj.x,
              y: positionedObj.y,
              w: positionedObj.w,
              h: positionedObj.h,
              ...(obj.line ? { line: obj.line, lineSize: obj.lineSize } : {}),
              transparency: positionedObj.transparency
            }
          });
          break;
        default:
          console.warn(`Unknown object type: ${obj.type}`);
      }
    }

    return resultObjects;
  } catch (error) {
    console.error('SVG 可编辑转换失败:', error);
    return [];
  }
}
