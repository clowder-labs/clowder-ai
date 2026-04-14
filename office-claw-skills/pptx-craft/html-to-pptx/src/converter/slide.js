// 幻灯片聚合转换

import html2canvas from "html2canvas";
import { isNoWrap } from "../parser/dom.js";
import {
  detectLineBreakBetweenNodes,
  detectLineBreaks,
  detectLineBreaksForInlineElement,
  detectLineBreaksForTextNode,
  extractTableData,
  generateBlurredSVG,
  generateCompositeBorderSVG,
  generateCustomShapeSVG,
  generateGradientSVG,
  getBorderInfo,
  getGradientFallbackColor,
  getPadding,
  getRotation,
  getSoftEdges,
  getTextStyle,
  getVisibleShadow,
  isClippedByParent,
  isTextContainer,
  parseColor,
  svgStringToPng,
  svgToPng,
  svgToSvg,
} from "../utils.js";
import { getProcessedImage } from "./image.js";

const PPI = 96;
const PX_TO_INCH = 1 / PPI;

function isSvgGradientDriven(node) {
  if (!node || node.nodeName?.toUpperCase() !== "SVG") return false;
  const hasGradientDefs = !!node.querySelector("linearGradient, radialGradient");
  if (!hasGradientDefs) return false;

  // ECharts 常见写法：path fill="url(#xxx)" 或 style="fill:url(#xxx)"
  const hasGradientRef = !!node.querySelector(
    "[fill*='url('], [stroke*='url('], [style*='fill:url('], [style*='stroke:url(']"
  );
  return hasGradientRef;
}

function shouldFlattenRootBgGradient(node, style, config) {
  if (!config?.slideBgHex) return false;
  if (node.parentElement !== config.root) return false;
  if (style.position !== "absolute" || style.inset !== "0px") return false;

  // 只处理纯背景层，避免误伤图表/内容容器
  if ((node.textContent || "").trim().length > 0) return false;
  if (node.children.length > 0) return false;

  // 仅对 Tailwind 背景渐变类启用（如 bg-gradient-to-br）
  const cls = node.className || "";
  if (typeof cls !== "string" || !/\bbg-gradient-to-[a-z]+\b/.test(cls)) return false;

  return true;
}

/**
 * Check if an element has explicit width set in inline style.
 * @param {HTMLElement} node
 * @returns {boolean}
 */
function hasExplicitWidth(node) {
  if (!node || node.nodeType !== 1) return false;
  const inlineStyle = node.getAttribute("style");
  if (!inlineStyle) return false;
  return /(^|;)\s*width\s*:/.test(inlineStyle);
}


/**
 * Optimized html2canvas wrapper
 * Includes fix for cropped icons by adjusting styles in the cloned document.
 */
async function elementToCanvasImage(node, widthPx, heightPx) {
  return new Promise((resolve) => {
    // 1. Assign a temp ID to locate the node inside the cloned document
    const originalId = node.id;
    const tempId = "pptx-capture-" + Math.random().toString(36).substr(2, 9);
    node.id = tempId;

    const width = Math.max(Math.ceil(widthPx), 1);
    const height = Math.max(Math.ceil(heightPx), 1);
    const style = window.getComputedStyle(node);

    // Add padding to the clone to capture spilling content (like extensive font glyphs)
    const padding = 10;

    html2canvas(node, {
      backgroundColor: null,
      logging: false,
      scale: 3, // Higher scale for sharper icons
      useCORS: true, // critical for external fonts/images
      width: width + padding * 2, // Capture a larger area
      height: height + padding * 2,
      x: -padding, // Offset capture to include the padding
      y: -padding,
      onclone: (clonedDoc) => {
        const clonedNode = clonedDoc.getElementById(tempId);
        if (clonedNode) {
          // --- FIX: CLIP & FONT ISSUES ---
          // Apply styles DIRECTLY to elements to ensure html2canvas picks them up
          // This avoids issues where <style> tags in onclone are ignored or delayed

          // 1. Force FontAwesome Family on Icons
          const icons = clonedNode.querySelectorAll(".fa, .fas, .far, .fab");
          icons.forEach((icon) => {
            icon.style.setProperty("font-family", "FontAwesome", "important");
          });

          // 2. Fix Image Display
          const images = clonedNode.querySelectorAll("img");
          images.forEach((img) => {
            img.style.setProperty("display", "inline-block", "important");
          });

          // 3. Force overflow visible on the container so glyphs bleeding out aren't cut
          clonedNode.style.overflow = "visible";

          // 4. Adjust alignment for Icons to prevent baseline clipping
          // (Applies to <i>, <span>, or standard icon classes)
          const tag = clonedNode.tagName;
          if (tag === "I" || tag === "SPAN" || clonedNode.className.includes("fa-")) {
            // Flex center helps align the glyph exactly in the middle of the box
            // preventing top/bottom cropping due to line-height mismatches.
            clonedNode.style.display = "inline-flex";
            clonedNode.style.justifyContent = "center";
            clonedNode.style.alignItems = "center";
            clonedNode.style.setProperty("font-family", "FontAwesome", "important"); // Ensure root icon gets it too

            // Remove margins that might offset the capture
            clonedNode.style.margin = "0";

            // Ensure the font fits
            clonedNode.style.lineHeight = "1";
            clonedNode.style.verticalAlign = "middle";
          }
        }
      },
    })
      .then((canvas) => {
        // Restore the original ID
        if (originalId) node.id = originalId;
        else node.removeAttribute("id");

        const destCanvas = document.createElement("canvas");
        destCanvas.width = width;
        destCanvas.height = height;
        const ctx = destCanvas.getContext("2d");

        // Draw captured canvas (which is padded) back to the original size
        // We need to draw the CENTER of the source canvas to the destination
        // The source canvas is (width + 2*padding) * scale
        // We want to draw the crop starting at padding*scale
        const scale = 3;
        const sX = padding * scale;
        const sY = padding * scale;
        const sW = width * scale;
        const sH = height * scale;

        ctx.drawImage(canvas, sX, sY, sW, sH, 0, 0, width, height);

        // --- Border Radius Clipping (Existing Logic) ---
        let tl = parseFloat(style.borderTopLeftRadius) || 0;
        let tr = parseFloat(style.borderTopRightRadius) || 0;
        let br = parseFloat(style.borderBottomRightRadius) || 0;
        let bl = parseFloat(style.borderBottomLeftRadius) || 0;

        const f = Math.min(
          width / (tl + tr) || Infinity,
          height / (tr + br) || Infinity,
          width / (br + bl) || Infinity,
          height / (bl + tl) || Infinity
        );

        if (f < 1) {
          tl *= f;
          tr *= f;
          br *= f;
          bl *= f;
        }

        if (tl + tr + br + bl > 0) {
          ctx.globalCompositeOperation = "destination-in";
          ctx.beginPath();
          ctx.moveTo(tl, 0);
          ctx.lineTo(width - tr, 0);
          ctx.arcTo(width, 0, width, tr, tr);
          ctx.lineTo(width, height - br);
          ctx.arcTo(width, height, width - br, height, br);
          ctx.lineTo(bl, height);
          ctx.arcTo(0, height, 0, height - bl, bl);
          ctx.lineTo(0, tl);
          ctx.arcTo(0, 0, tl, 0, tl);
          ctx.closePath();
          ctx.fill();
        }

        resolve(destCanvas.toDataURL("image/png"));
      })
      .catch((e) => {
        if (originalId) node.id = originalId;
        else node.removeAttribute("id");
        console.warn("Canvas capture failed for node", node, e);
        resolve(null);
      });
  });
}

/**
 * Captures only element background (without children) as PNG.
 */
async function elementBackgroundToCanvasImage(node, widthPx, heightPx) {
  return new Promise((resolve) => {
    const originalId = node.id;
    const tempId = "pptx-bg-capture-" + Math.random().toString(36).substr(2, 9);
    node.id = tempId;

    const width = Math.max(Math.ceil(widthPx), 1);
    const height = Math.max(Math.ceil(heightPx), 1);

    // Save original children
    const children = Array.from(node.childNodes);

    // Create a clone to avoid modifying the original DOM
    const clone = node.cloneNode(true);
    // Hide all children in the clone
    const childEls = clone.querySelectorAll("*");
    childEls.forEach((child) => {
      child.style.visibility = "hidden";
    });

    html2canvas(clone, {
      backgroundColor: null,
      logging: false,
      scale: 3,
      useCORS: true,
      width,
      height,
      onclone: (clonedDoc) => {
        const clonedNode = clonedDoc.getElementById(tempId);
        if (clonedNode) {
          clonedNode.style.overflow = "visible";
          const clonedChildren = clonedNode.querySelectorAll("*");
          clonedChildren.forEach((child) => {
            child.style.visibility = "hidden";
          });
        }
      },
    })
      .then((canvas) => {
        // Restore the original ID
        if (originalId) node.id = originalId;
        else node.removeAttribute("id");

        const destCanvas = document.createElement("canvas");
        destCanvas.width = width;
        destCanvas.height = height;
        const ctx = destCanvas.getContext("2d");
        ctx.drawImage(canvas, 0, 0, width * 3, height * 3, 0, 0, width, height);

        resolve(destCanvas.toDataURL("image/png"));
      })
      .catch((e) => {
        if (originalId) node.id = originalId;
        else node.removeAttribute("id");
        console.warn("Background capture failed for node", node, e);
        resolve(null);
      });
  });
}

// FontAwesome SVG Core
import { icon } from "@fortawesome/fontawesome-svg-core";

/**
 * Extracts Font Awesome icon information from element classes.
 * @param {HTMLElement} node
 * @returns {{ prefix: string, iconName: string } | null}
 */
function extractFontAwesomeIcon(node) {
  const cls = node.getAttribute("class") || "";
  if (typeof cls !== "string") return null;

  const classes = cls.split(/\s+/);

  // Determine prefix: fas (solid), far (regular), fab (brands)
  let prefix = null;
  let iconName = null;

  for (const c of classes) {
    if (c === "fas") prefix = "fas";
    else if (c === "far") prefix = "far";
    else if (c === "fab") prefix = "fab";
    else if (c === "fad")
      prefix = "fad"; // Duotone (not in free)
    else if (c === "fat")
      prefix = "fat"; // Thin (not in free)
    else if (c.startsWith("fa-") && c !== "fa") {
      // This is the icon name class (e.g., 'fa-robot')
      iconName = c.replace("fa-", "");
    }
  }

  // Default prefix to 'fas' if only icon name is provided
  if (iconName && !prefix) prefix = "fas";
  if (!iconName) return null;

  return { prefix, iconName };
}

/**
 * Generates an SVG string from Font Awesome icon definition.
 * @param {string} prefix - Icon prefix (fas, far, fab)
 * @param {string} iconName - Icon name without prefix
 * @param {Object} options - Style options
 * @param {string} options.color - Fill color (hex without #)
 * @param {number} options.size - Width and height in pixels
 * @returns {string} - SVG string
 */
function faIconToSvg(prefix, iconName, options = {}) {
  const { color = "000000", size = 24 } = options;

  try {
    // Get the icon definition from FontAwesome library
    const iconDef = icon({ prefix, iconName });

    if (!iconDef) {
      console.warn(`[FA] Icon not found: ${prefix} fa-${iconName}`);
      return null;
    }

    // Extract SVG attributes and paths
    const { html } = iconDef;

    if (!html) {
      console.warn(`[FA] No SVG data for: ${prefix} fa-${iconName}`);
      return null;
    }

    // Parse the HTML to extract paths and apply custom styles
    // FontAwesome html is like: <svg ...><path d="..." /></svg>
    // We need to extract the path data and wrap it with our custom attributes

    // Use a simpler approach: create SVG from raw icon data
    const iconData = iconDef.icon;

    if (!iconData) {
      return null;
    }

    const [width, height, , , svgPathData] = iconData;

    // Build SVG with custom color and size
    const svgWidth = size;
    const svgHeight = size;
    const viewBox = `0 0 ${width} ${height}`;

    // Handle both single path and array of paths
    let pathContent = "";
    if (Array.isArray(svgPathData)) {
      // Duotone or multi-path icons
      pathContent = svgPathData.map((d) => `<path d="${d}" fill="#${color}" />`).join("\n");
    } else {
      pathContent = `<path d="${svgPathData}" fill="#${color}" />`;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${svgWidth}" height="${svgHeight}">${pathContent}</svg>`;

    return svg;
  } catch (e) {
    console.warn(`[FA] Error generating SVG for ${prefix} fa-${iconName}:`, e);
    return null;
  }
}

/**
 * Renders a Font Awesome icon element as a PNG image.
 * @param {HTMLElement} node - The icon element
 * @returns {Promise<string|null>} - PNG data URL or null on failure
 */
async function renderFAIconAsImage(node) {
  const iconInfo = extractFontAwesomeIcon(node);
  if (!iconInfo) return null;

  const { prefix, iconName } = iconInfo;

  // Get computed styles for color and size
  const style = window.getComputedStyle(node);
  const colorObj = parseColor(style.color);
  const color = colorObj.hex || "000000";

  // Use font-size as the icon size, fallback to 24px
  const fontSize = parseFloat(style.fontSize) || 24;

  // Generate SVG
  const svgString = faIconToSvg(prefix, iconName, { color, size: fontSize });
  if (!svgString) return null;

  // Convert SVG to PNG using existing utility
  const pngData = await svgStringToPng(svgString, fontSize, fontSize);
  return pngData;
}

/**
 * 渲染 Font Awesome 图标为 PNG 图片（带颜色和大小参数）
 * @param {string} prefix - 图标前缀 (fas, far, fab)
 * @param {string} iconName - 图标名称
 * @param {Object} options - 样式选项
 * @param {string} options.color - 填充颜色 (hex without #)
 * @param {number} options.size - 宽高（像素）
 * @returns {Promise<string|null>} - PNG 数据 URL 或失败时返回 null
 */
async function renderFAIconAsImageWithColor(prefix, iconName, options = {}) {
  const { color = "000000", size = 24 } = options;

  try {
    // Generate SVG
    const svgString = faIconToSvg(prefix, iconName, { color, size });
    if (!svgString) return null;

    // Convert SVG to PNG using existing utility
    const pngData = await svgStringToPng(svgString, size, size);
    return pngData;
  } catch (e) {
    console.warn(`[FA] Error generating PNG for ${prefix} fa-${iconName}:`, e);
    return null;
  }
}

/**
 * Helper to identify elements that should be rendered as icons (Images).
 * Detects Custom Elements AND generic tags (<i>, <span>) with icon classes/pseudo-elements.
 */
function isIconElement(node) {
  // 1. Custom Elements (hyphenated tags) or Explicit Library Tags
  const tag = node.tagName.toUpperCase();
  if (
    tag.includes("-") ||
    ["MATERIAL-ICON", "ICONIFY-ICON", "REMIX-ICON", "ION-ICON", "EVA-ICON", "BOX-ICON", "FA-ICON"].includes(tag)
  ) {
    return true;
  }

  // 2. Class-based Icons (FontAwesome, Bootstrap, Material symbols) on <i> or <span>
  if (tag === "I" || tag === "SPAN") {
    const cls = node.getAttribute("class") || "";
    if (
      typeof cls === "string" &&
      (cls.includes("fa-") ||
        cls.includes("fas") ||
        cls.includes("far") ||
        cls.includes("fab") ||
        cls.includes("bi-") ||
        cls.includes("material-icons") ||
        cls.includes("icon"))
    ) {
      // Check if this is a Font Awesome icon - we can render via SVG
      const faInfo = extractFontAwesomeIcon(node);
      if (faInfo) {
        return true;
      }

      // Double-check: Must have pseudo-element content to be a CSS icon
      const before = window.getComputedStyle(node, "::before").content;
      const after = window.getComputedStyle(node, "::after").content;
      const hasContent = (c) => c && c !== "none" && c !== "normal" && c !== '""';

      if (hasContent(before) || hasContent(after)) return true;
    }
  }

  return false;
}

function isInlineTextWithIconMix(node) {
  if (!node || node.nodeType !== 1) return false;
  const tag = (node.tagName || "").toUpperCase();
  if (!["P", "SPAN", "DIV"].includes(tag)) return false;

  let hasTextNode = false;
  let hasInlineIcon = false;
  for (const child of node.childNodes) {
    if (child.nodeType === 3 && child.nodeValue && child.nodeValue.trim().length > 0) {
      hasTextNode = true;
      continue;
    }
    if (child.nodeType === 1 && isIconElement(child)) {
      hasInlineIcon = true;
      continue;
    }
  }

  if (!hasTextNode || !hasInlineIcon) return false;

  // Avoid flattening layout containers; only target simple inline text rows.
  const style = window.getComputedStyle(node);
  const display = (style.display || "").toLowerCase();
  if (display === "flex" || display === "inline-flex" || display === "grid" || display === "inline-grid") {
    return false;
  }

  return true;
}

function extractVisualLinesFromTextNode(textNode) {
  if (!textNode || textNode.nodeType !== 3) return [];

  const raw = textNode.nodeValue || "";
  if (!raw.trim()) return [];

  const range = document.createRange();
  const chars = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "\n" || ch === "\r" || ch === "\t") continue;
    range.setStart(textNode, i);
    range.setEnd(textNode, i + 1);
    const rect = range.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    chars.push({ idx: i, rect });
  }
  range.detach();

  if (chars.length === 0) return [];

  const lines = [];
  let lineStartPos = 0;
  let lineTop = chars[0].rect.top;
  let lineBottom = chars[0].rect.bottom;
  let lineLeft = chars[0].rect.left;
  let lineRight = chars[0].rect.right;
  let prevLeft = chars[0].rect.left;

  const pushLine = (startPos, endPos) => {
    if (endPos < startPos) return;
    const startRawIdx = chars[startPos].idx;
    const endRawIdx = chars[endPos].idx + 1;
    const text = raw.slice(startRawIdx, endRawIdx).trim();
    if (!text) return;
    lines.push({
      text,
      left: lineLeft,
      right: lineRight,
      top: lineTop,
      bottom: lineBottom,
    });
  };

  for (let p = 1; p < chars.length; p++) {
    const cur = chars[p];
    const movedDown = cur.rect.top > lineTop + 2;
    const movedLeft = cur.rect.left < prevLeft - 1;
    const returnedToLineStart = cur.rect.left <= lineLeft + 4;
    const isNewLine = movedDown && movedLeft && returnedToLineStart;

    if (isNewLine) {
      pushLine(lineStartPos, p - 1);
      lineStartPos = p;
      lineTop = cur.rect.top;
      lineBottom = cur.rect.bottom;
      lineLeft = cur.rect.left;
      lineRight = cur.rect.right;
    } else {
      lineTop = Math.min(lineTop, cur.rect.top);
      lineBottom = Math.max(lineBottom, cur.rect.bottom);
      lineLeft = Math.min(lineLeft, cur.rect.left);
      lineRight = Math.max(lineRight, cur.rect.right);
    }

    prevLeft = cur.rect.left;
  }

  pushLine(lineStartPos, chars.length - 1);
  return lines;
}

/**
 * Replaces createRenderItem.
 * Returns { items: [], job: () => Promise, stopRecursion: boolean }
 */
function prepareRenderItem(node, config, domOrder, pptx, slide, effectiveZIndex, computedStyle, globalOptions = {}) {
  // 1. Text Node Handling
  if (node.nodeType === 3) {
    const textContent = node.nodeValue.trim();
    if (!textContent) return null;

    const parent = node.parentElement;
    if (!parent) return null;

    if (isTextContainer(parent)) return null; // Parent handles it

    const range = document.createRange();
    range.selectNode(node);
    const rect = range.getBoundingClientRect();
    range.detach();

    const style = window.getComputedStyle(parent);
    const widthPx = rect.width;
    const heightPx = rect.height;
    let textStartLeftPx = rect.left;
    const unrotatedH = heightPx * PX_TO_INCH * config.scale;
    const y = config.offY + (rect.top - config.rootY) * PX_TO_INCH * config.scale;

    // Check if parent is a flex column with space-between
    // In this case, text should be vertically centered in its box to match browser rendering
    const parentStyle = window.getComputedStyle(parent);
    const isFlexColumn =
      parentStyle.display === "flex" && (parentStyle.flexDirection || "").toLowerCase().startsWith("column");
    const isSpaceBetween = isFlexColumn && (parentStyle.justifyContent || "").toLowerCase() === "space-between";

    // For inline icon + text mixed rows (<i> + text + <i>), build one editable
    // PPT text object per visual line to preserve browser wrapping around icons.
    if (isInlineTextWithIconMix(parent) && !isNoWrap(parentStyle)) {
      const visualLines = extractVisualLinesFromTextNode(node);
      if (visualLines.length > 1) {
        const textStyle = getTextStyle(style, config.scale);
        const lineItems = visualLines.map((line, idx) => {
          const lineX = config.offX + (line.left - config.rootX) * PX_TO_INCH * config.scale;
          const lineY = config.offY + (line.top - config.rootY) * PX_TO_INCH * config.scale;
          const lineW = Math.max((line.right - line.left) * PX_TO_INCH * config.scale * 1.02, 0.01);
          const lineH = Math.max((line.bottom - line.top) * PX_TO_INCH * config.scale, 0.01);
          return {
            type: "text",
            zIndex: effectiveZIndex,
            domOrder: domOrder + idx,
            textParts: [{ text: line.text, options: textStyle }],
            options: {
              x: lineX,
              y: lineY,
              w: lineW,
              h: lineH,
              margin: 0,
              autoFit: false,
              wrap: false,
              ...(isSpaceBetween ? { valign: "middle" } : {}),
            },
          };
        });
        return { items: lineItems, stopRecursion: false };
      }
    }

    // Detect if this text node is rendered on a single line in the browser
    // If so, we need to ensure it doesn't wrap in PPT
    let isSingleLine = true;
    let lineBreakPositions = null;

    // Check if the text spans multiple lines by measuring character positions
    if (parentStyle.whiteSpace !== "nowrap" && parentStyle.whiteSpace !== "pre") {
      // Sample first and last character to detect line breaks
      if (node.nodeValue.length > 1) {
        const testRange = document.createRange();

        // Check first non-whitespace character (avoid indentation/newline noise)
        let firstCharIdx = 0;
        while (firstCharIdx < node.nodeValue.length && /\s/.test(node.nodeValue[firstCharIdx])) {
          firstCharIdx++;
        }
        if (firstCharIdx >= node.nodeValue.length) {
          testRange.detach();
          return null;
        }
        testRange.setStart(node, firstCharIdx);
        testRange.setEnd(node, firstCharIdx + 1);
        const firstRect = testRange.getBoundingClientRect();
        textStartLeftPx = firstRect.left;

        // Check last non-whitespace character
        let lastCharIdx = node.nodeValue.length - 1;
        while (lastCharIdx > 0 && /\s/.test(node.nodeValue[lastCharIdx])) {
          lastCharIdx--;
        }

        if (lastCharIdx > 0) {
          testRange.setStart(node, lastCharIdx);
          testRange.setEnd(node, lastCharIdx + 1);
          const lastRect = testRange.getBoundingClientRect();

          // If first and last character are on different lines, text is wrapped
          if (Math.abs(firstRect.top - lastRect.top) > 2) {
            isSingleLine = false;
            // Detect line break positions for multi-line text
            const lbResult = detectLineBreaksForTextNode(node);
            lineBreakPositions = lbResult && Array.isArray(lbResult.breaks) ? lbResult.breaks : null;
          }
        }

        testRange.detach();
      }
    }

    // Build text parts with line breaks if needed
    let textParts;
    if (isSingleLine || !lineBreakPositions || lineBreakPositions.length === 0) {
      textParts = [
        {
          text: textContent,
          options: getTextStyle(style, config.scale),
        },
      ];
    } else {
      // Insert line breaks at detected positions
      textParts = [];
      let lastEnd = 0;
      for (let bi = 0; bi < lineBreakPositions.length; bi++) {
        const breakPos = lineBreakPositions[bi];
        if (breakPos > lastEnd) {
          const segmentText = node.nodeValue.slice(lastEnd, breakPos).trim();
          if (!segmentText) {
            lastEnd = breakPos;
            continue;
          }
          textParts.push({
            text: segmentText,
            options: {
              ...getTextStyle(style, config.scale),
              // Preserve visual line breaks for standalone text nodes (e.g. text between icons).
              breakLine: true,
            },
          });
        }
        lastEnd = breakPos;
      }
      if (lastEnd < node.nodeValue.length) {
        const remainingText = node.nodeValue.slice(lastEnd).trim();
        if (remainingText.length > 0) {
          textParts.push({
            text: remainingText,
            options: getTextStyle(style, config.scale),
          });
        }
      }
    }

    const x = config.offX + (textStartLeftPx - config.rootX) * PX_TO_INCH * config.scale;
    // Keep right edge from the measured text-node rect, but align x to the first visible glyph.
    const adjustedWidthPx = Math.max(rect.right - textStartLeftPx, 1);
    const adjustedUnrotatedW = adjustedWidthPx * PX_TO_INCH * config.scale;

    // For single-line text, add a small width buffer to prevent PPT wrapping due to font differences
    const finalW = isSingleLine ? adjustedUnrotatedW * 1.05 : adjustedUnrotatedW;
    const shouldUseNativeWrap = !isSingleLine && (!lineBreakPositions || lineBreakPositions.length === 0);

    // Build text options with vertical centering if needed
    const textOptions = {
      x,
      y,
      w: finalW,
      h: unrotatedH,
      margin: 0,
      autoFit: false,
      wrap: shouldUseNativeWrap,
    };

    // If parent uses flex column + space-between, vertically center text in its box
    // This matches browser behavior where text is centered within its line-height
    if (isSpaceBetween) {
      textOptions.valign = "middle";
    }

    return {
      items: [
        {
          type: "text",
          zIndex: effectiveZIndex,
          domOrder,
          textParts: textParts,
          options: textOptions,
        },
      ],
      stopRecursion: false,
    };
  }

  if (node.nodeType !== 1) return null;
  const style = computedStyle; // Use pre-computed style

  // 提前检测 FA 图标：当 CSS 未加载导致 ::before 失效时，元素尺寸为 0，
  // 但图标通过 JS API 渲染不依赖 CSS 尺寸，不应被零尺寸过滤掉。
  const earlyFaCheck = extractFontAwesomeIcon(node);

  const rect = node.getBoundingClientRect();
  if (rect.width < 0.5 && rect.height < 0.5 && !earlyFaCheck) return null;

  const zIndex = effectiveZIndex;
  const rotation = getRotation(style.transform);
  const elementOpacity = parseFloat(style.opacity);
  const safeOpacity = isNaN(elementOpacity) ? 1 : elementOpacity;

  const widthPx = node.offsetWidth || rect.width;
  const heightPx = node.offsetHeight || rect.height;
  const unrotatedW = widthPx * PX_TO_INCH * config.scale;
  const unrotatedH = heightPx * PX_TO_INCH * config.scale;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  let x = config.offX + (centerX - config.rootX) * PX_TO_INCH * config.scale - unrotatedW / 2;
  let y = config.offY + (centerY - config.rootY) * PX_TO_INCH * config.scale - unrotatedH / 2;
  const w = unrotatedW;
  const h = unrotatedH;

  const items = [];
  let gradientJob = null;

  if (node.tagName === "TABLE") {
    const tableData = extractTableData(node, config.scale);

    // Calculate total table width to ensure X position is correct
    // (Though x calculation above usually handles it, tables can be finicky)
    return {
      items: [
        {
          type: "table",
          zIndex: effectiveZIndex,
          domOrder,
          tableData: tableData,
          options: { x, y, w: unrotatedW, h: unrotatedH },
        },
      ],
      stopRecursion: true, // Important: Don't process TR/TD as separate shapes
    };
  }

  if ((node.tagName === "UL" || node.tagName === "OL") && !isComplexHierarchy(node)) {
    const listItems = [];
    const liChildren = Array.from(node.children).filter((c) => c.tagName === "LI");

    liChildren.forEach((child, index) => {
      const liStyle = window.getComputedStyle(child);
      const liRect = child.getBoundingClientRect();
      const parentRect = node.getBoundingClientRect(); // node is UL/OL

      // 1. Determine Bullet Config
      let bullet = { type: "bullet" };
      const listStyleType = liStyle.listStyleType || "disc";

      if (node.tagName === "OL" || listStyleType === "decimal") {
        bullet = { type: "number" };
      } else if (listStyleType === "none") {
        bullet = false;
      } else {
        let code = "2022"; // disc
        if (listStyleType === "circle") code = "25CB";
        if (listStyleType === "square") code = "25A0";

        // --- CHANGE: Color & Size Logic (Option > ::marker > CSS color) ---
        let finalHex = "000000";
        let markerFontSize = null;

        // A. Check Global Option override
        if (globalOptions?.listConfig?.color) {
          finalHex = parseColor(globalOptions.listConfig.color).hex || "000000";
        }
        // B. Check ::marker pseudo element (supported in modern browsers)
        else {
          const markerStyle = window.getComputedStyle(child, "::marker");
          const markerColor = parseColor(markerStyle.color);
          if (markerColor.hex) {
            finalHex = markerColor.hex;
          } else {
            // C. Fallback to LI text color
            const colorObj = parseColor(liStyle.color);
            if (colorObj.hex) finalHex = colorObj.hex;
          }

          // Check ::marker font-size
          const markerFs = parseFloat(markerStyle.fontSize);
          if (!isNaN(markerFs) && markerFs > 0) {
            // Convert px->pt for PPTX
            markerFontSize = markerFs * 0.75 * config.scale;
          }
        }

        bullet = { code, color: finalHex };
        if (markerFontSize) {
          bullet.fontSize = markerFontSize;
        }
      }

      // 2. Calculate Dynamic Indent (Respects padding-left)
      // Visual Indent = Distance from UL left edge to LI Content left edge.
      // PptxGenJS 'indent' = Space between bullet and text?
      // Actually PptxGenJS 'indent' allows setting the hanging indent.
      // We calculate the TOTAL visual offset from the parent container.
      // 1 px = 0.75 pt (approx, standard DTP).
      // We must scale it by config.scale.
      const visualIndentPx = liRect.left - parentRect.left;
      /*
         Standard indent in PPT is ~27pt.
         If visualIndentPx is small (e.g. 10px padding), we want small indent.
         If visualIndentPx is large (e.g. 40px padding), we want large indent.
         We treat 'indent' as the value to pass to PptxGenJS.
      */
      const computedIndentPt = visualIndentPx * 0.75 * config.scale;

      if (bullet && computedIndentPt > 0) {
        bullet.indent = computedIndentPt;
        // Also support custom margin between bullet and text if provided in listConfig?
        // For now, computedIndentPt covers the visual placement.
      }

      // 3. Extract Text Parts
      const parts = collectListParts(child, liStyle, config.scale);

      if (parts.length > 0) {
        parts.forEach((p) => {
          if (!p.options) p.options = {};
        });

        // A. Apply Bullet
        // Workaround: pptxgenjs bullets inherit the style of the text run they are attached to.
        // To support ::marker styles (color, size) that differ from the text, we create
        // a "dummy" text run at the start of the list item that carries the bullet configuration.
        if (bullet) {
          const firstPartInfo = parts[0].options;

          // Create a dummy run. We use a Zero Width Space to ensure it's rendered but invisible.
          // This "run" will hold the bullet and its specific color/size.
          const bulletRun = {
            text: "\u200B",
            options: {
              ...firstPartInfo, // Inherit base props (fontFace, etc.)
              color: bullet.color || firstPartInfo.color,
              fontSize: bullet.fontSize || firstPartInfo.fontSize,
              bullet: bullet,
            },
          };

          // Don't duplicate transparent or empty color from firstPart if bullet has one
          if (bullet.color) bulletRun.options.color = bullet.color;
          if (bullet.fontSize) bulletRun.options.fontSize = bullet.fontSize;

          // Prepend
          parts.unshift(bulletRun);
        }

        // B. Apply Spacing
        let ptBefore = 0;
        let ptAfter = 0;

        // Read spacing from LI element's CSS margin (e.g. Tailwind space-y-*)
        const liMarginTop = parseFloat(liStyle.marginTop);
        const liMarginBottom = parseFloat(liStyle.marginBottom);
        if (!isNaN(liMarginTop) && liMarginTop > 0) {
          ptBefore = Math.max(ptBefore, liMarginTop * 0.75 * config.scale);
        }
        if (!isNaN(liMarginBottom) && liMarginBottom > 0) {
          ptAfter = Math.max(ptAfter, liMarginBottom * 0.75 * config.scale);
        }

        // Use Global Options for spacing (Expected in Points)
        if (globalOptions.listConfig?.spacing) {
          if (typeof globalOptions.listConfig.spacing.before === "number") {
            ptBefore = globalOptions.listConfig.spacing.before;
          }
          if (typeof globalOptions.listConfig.spacing.after === "number") {
            ptAfter = globalOptions.listConfig.spacing.after;
          }
        }

        if (ptBefore > 0) parts[0].options.paraSpaceBefore = ptBefore;
        if (ptAfter > 0) parts[0].options.paraSpaceAfter = ptAfter;

        if (index < liChildren.length - 1) {
          parts[parts.length - 1].options.breakLine = true;
        }

        listItems.push(...parts);
      }
    });

    if (listItems.length > 0) {
      // Add background if exists
      const bgColorObj = parseColor(style.backgroundColor);
      if (bgColorObj.hex && bgColorObj.opacity > 0) {
        items.push({
          type: "shape",
          zIndex,
          domOrder,
          shapeType: "rect",
          options: { x, y, w, h, fill: { color: bgColorObj.hex } },
        });
      }

      items.push({
        type: "text",
        zIndex: zIndex + 1,
        domOrder,
        textParts: listItems,
        options: {
          x,
          y,
          w,
          h,
          align: "left",
          valign: "top",
          margin: 0,
          autoFit: false,
          wrap: false,
        },
      });

      return { items, stopRecursion: true };
    }
  }

  if (node.tagName === "CANVAS") {
    const item = {
      type: "image",
      zIndex,
      domOrder,
      options: { x, y, w, h, rotate: rotation, data: null },
    };

    const job = async () => {
      try {
        // Direct data extraction from the canvas element
        // This preserves the exact current state of the chart
        const dataUrl = node.toDataURL("image/png");

        // Basic validation
        if (dataUrl && dataUrl.length > 10) {
          item.options.data = dataUrl;
        } else {
          item.skip = true;
        }
      } catch (e) {
        // Tainted canvas (CORS issues) will throw here
        console.warn("Failed to capture canvas content:", e);
        item.skip = true;
      }
    };

    return { items: [item], job, stopRecursion: true };
  }

  // --- ASYNC JOB: SVG Tags ---
  if (node.nodeName.toUpperCase() === "SVG") {
    let accumulatedOpacity = safeOpacity;
    let parent = node.parentElement;
    while (parent && parent !== config.root) {
      const parentStyle = window.getComputedStyle(parent);
      const parentOpacity = parseFloat(parentStyle.opacity);
      if (!isNaN(parentOpacity) && parentOpacity < 1) {
        accumulatedOpacity *= parentOpacity;
      }
      parent = parent.parentElement;
    }

    // 判断是否使用可编辑模式转换 SVG
    // 对引用 gradient 的 SVG（如 ECharts 面积图）降级为位图，避免渐变丢失
    const svgHasGradient = isSvgGradientDriven(node);
    const useEditableMode = globalOptions.svgAsEditable === true && !svgHasGradient;

    const item = {
      type: useEditableMode ? "svg-editable" : "image",
      zIndex,
      domOrder,
      options: {
        data: null,
        x,
        y,
        w,
        h,
        rotate: rotation,
        svgNode: useEditableMode ? node : undefined,
        transparency: accumulatedOpacity < 1 ? (1 - accumulatedOpacity) * 100 : undefined
      },
    };

    const job = async () => {
      if (useEditableMode) {
        // 使用 svg-to-pptx 转换为可编辑对象
        // 注意：不直接添加到幻灯片，而是将转换结果存储在 item 中
        // 等待所有 job 执行完成后，按正确的 z-index 顺序添加
        const { convertSVGToObjects } = await import("../utils/svg-to-pptx-bridge.js");

        const objects = await convertSVGToObjects(node, { x, y, w: w, h: h }, accumulatedOpacity);
        item.options.data = objects; // 存储转换结果
        item.options.svgProcessed = true; // 标记已处理
      } else {
        // 原有逻辑：rasterization 或矢量图片
        // 对 gradient SVG 强制位图，保证视觉一致性
        const converter = svgHasGradient ? svgToPng : (globalOptions.svgAsVector ? svgToSvg : svgToPng);
        const processed = await converter(node);
        if (processed) {
          item.options.data = processed;
          if (accumulatedOpacity < 1) {
            item.options.transparency = (1 - accumulatedOpacity) * 100;
          }
        } else {
          item.skip = true;
        }
      }
    };

    return { items: [item], job, stopRecursion: true };
  }

  // --- ASYNC JOB: IMG Tags ---
  if (node.tagName === "IMG") {
    let radii = {
      tl: parseFloat(style.borderTopLeftRadius) || 0,
      tr: parseFloat(style.borderTopRightRadius) || 0,
      br: parseFloat(style.borderBottomRightRadius) || 0,
      bl: parseFloat(style.borderBottomLeftRadius) || 0,
    };

    const hasAnyRadius = radii.tl > 0 || radii.tr > 0 || radii.br > 0 || radii.bl > 0;
    if (!hasAnyRadius) {
      const parent = node.parentElement;
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.overflow !== "visible") {
        const pRadii = {
          tl: parseFloat(parentStyle.borderTopLeftRadius) || 0,
          tr: parseFloat(parentStyle.borderTopRightRadius) || 0,
          br: parseFloat(parentStyle.borderBottomRightRadius) || 0,
          bl: parseFloat(parentStyle.borderBottomLeftRadius) || 0,
        };
        const pRect = parent.getBoundingClientRect();
        if (Math.abs(pRect.width - rect.width) < 5 && Math.abs(pRect.height - rect.height) < 5) {
          radii = pRadii;
        }
      }
    }

    const objectFit = style.objectFit || "fill"; // default CSS behavior is fill
    const objectPosition = style.objectPosition || "50% 50%";

    const item = {
      type: "image",
      zIndex,
      domOrder,
      options: { x, y, w, h, rotate: rotation, data: null },
    };

    const job = async () => {
      const processed = await getProcessedImage(node.src, widthPx, heightPx, radii, objectFit, objectPosition);
      if (processed) item.options.data = processed;
      else item.skip = true;
    };

    return { items: [item], job, stopRecursion: true };
  }

  // --- ASYNC JOB: Icons and Other Elements ---
  const iconCheck = isIconElement(node);
  if (iconCheck) {
    // For Font Awesome icons, use contain logic: square icon centered in element box
    let iconX = x,
      iconY = y,
      iconW = w,
      iconH = h;
    const faInfo = extractFontAwesomeIcon(node);

    // 提取图标颜色和大小（同步阶段，确保能正确获取计算样式）
    const iconColorObj = parseColor(style.color);
    const iconColor = iconColorObj.hex || "000000";
    const iconFontSize = parseFloat(style.fontSize) || 24;

    if (faInfo) {
      // Calculate the largest square that fits in the element box
      const minDim = Math.min(w, h);
      iconW = minDim;
      iconH = minDim;
      // Center the icon
      iconX = x + (w - minDim) / 2;
      iconY = y + (h - minDim) / 2;
    }

    const item = {
      type: "image",
      zIndex,
      domOrder,
      options: { x: iconX, y: iconY, w: iconW, h: iconH, rotate: rotation, data: null },
    };
    const job = async () => {
      // Try Font Awesome SVG rendering first
      if (faInfo) {
        // 使用同步阶段提取的颜色和大小，避免异步时无法获取样式
        // 不传递 opacity，生成不透明的 PNG
        const faPngData = await renderFAIconAsImageWithColor(faInfo.prefix, faInfo.iconName, {
          color: iconColor,
          size: iconFontSize
        });
        if (faPngData) {
          item.options.data = faPngData;
          // 在 addImage 时设置 transparency（PptxGenJS: 0-100）
          const transparency = Math.round((1 - safeOpacity) * 100);
          if (transparency > 0 && transparency < 100) {
            item.options.transparency = transparency;
          }
          return;
        }
      }

      // Fallback to html2canvas for non-FA icons or SVG failure
      const pngData = await elementToCanvasImage(node, widthPx, heightPx);
      if (pngData) {
        item.options.data = pngData;
        // 同样为 html2canvas 生成的图片设置 transparency
        const transparency = Math.round((1 - safeOpacity) * 100);
        if (transparency > 0 && transparency < 100) {
          item.options.transparency = transparency;
        }
      }
      else item.skip = true;
    };
    return { items: [item], job, stopRecursion: true };
  }

  // Radii logic
  const borderRadiusValue = parseFloat(style.borderRadius) || 0;
  const borderRadii = {
    tl: parseFloat(style.borderTopLeftRadius) || 0,
    tr: parseFloat(style.borderTopRightRadius) || 0,
    br: parseFloat(style.borderBottomRightRadius) || 0,
    bl: parseFloat(style.borderBottomLeftRadius) || 0,
  };
  const radiusValues = Object.values(borderRadii);
  const hasAnyRadius = radiusValues.some((v) => v > 0);
  const hasPartialBorderRadius = hasAnyRadius && new Set(radiusValues).size > 1;

  // --- PRIORITY SVG: Solid Fill with Partial Border Radius (Vector Cone/Tab) ---
  // Fix for "missing cone": Prioritize SVG vector generation over Raster Canvas for simple shapes with partial radii.
  // This avoids html2canvas failures on empty divs.
  const tempBg = parseColor(style.backgroundColor);
  const isTxt = isTextContainer(node);

  // BUG FIX: Don't treat as a vector shape if it has content (like text or children).
  // This prevents containers like ".glass-box" from being treated as empty shapes and stopping recursion.
  const hasContent = node.textContent.trim().length > 0 || node.children.length > 0;

  if (hasPartialBorderRadius && tempBg.hex && !isTxt && !hasContent) {
    const shapeSvg = generateCustomShapeSVG(widthPx, heightPx, tempBg.hex, tempBg.opacity, borderRadii);

    return {
      items: [
        {
          type: "image",
          zIndex,
          domOrder,
          options: { data: shapeSvg, x, y, w, h, rotate: rotation },
        },
      ],
      stopRecursion: true, // Treat as leaf
    };
  }

  // --- ASYNC JOB: Clipped Divs via Canvas ---
  // Only capture as image if it's an empty leaf.
  // Rasterizing containers (like .glass-box) kills editability of children.
  if (hasPartialBorderRadius && isClippedByParent(node) && !hasContent) {
    const marginLeft = parseFloat(style.marginLeft) || 0;
    const marginTop = parseFloat(style.marginTop) || 0;
    x += marginLeft * PX_TO_INCH * config.scale;
    y += marginTop * PX_TO_INCH * config.scale;

    const item = {
      type: "image",
      zIndex,
      domOrder,
      options: { x, y, w, h, rotate: rotation, data: null },
    };

    const job = async () => {
      const canvasImageData = await elementToCanvasImage(node, widthPx, heightPx);
      if (canvasImageData) item.options.data = canvasImageData;
      else item.skip = true;
    };

    return { items: [item], job, stopRecursion: true };
  }

  // --- SYNC: Standard CSS Extraction ---
  const bgColorObj = parseColor(style.backgroundColor);
  const bgClip = style.webkitBackgroundClip || style.backgroundClip;
  const isBgClipText = bgClip === "text";
  let hasGradient = !isBgClipText && style.backgroundImage && style.backgroundImage.includes("linear-gradient");
  let isTiledGradientPattern = false;

  // 如果是通过 background-size + 多层 linear-gradient 叠加出来的“小格子 / 网格”效果，
  // 当前引擎无法精确复刻 CSS 的平铺行为，直接按整块渐变去渲染会把本来很弱的装饰
  // 变成一大片明显的色层（例如你这页上半部分的黑→白过度）。
  //
  // 这里做一个保护：当检测到
  //   - 存在非 auto 的 background-size（例如 60px 60px），并且
  //   - background-image 里有多层 gradient 叠加
  // 时，放弃专门的渐变渲染，让该元素不再生成独立的渐变背景，从而保留底层大背景的视觉效果。
  if (hasGradient) {
    const bgImg = style.backgroundImage || "";
    const bgSize = style.backgroundSize || "";
    const hasExplicitSize = bgSize && bgSize !== "auto" && bgSize !== "auto auto" && bgSize !== "initial";
    const gradientLayers = bgImg.split(/,(?![^()]*\))/).filter((p) => /gradient\(/i.test(p));
    const hasMultipleGradients = gradientLayers.length > 1;

    if (hasExplicitSize && hasMultipleGradients) {
      isTiledGradientPattern = true;
      hasGradient = false;
    }
  }

  const borderColorObj = parseColor(style.borderColor);
  const borderWidth = parseFloat(style.borderWidth);
  const borderStyle = style.borderStyle;
  const hasBorder =
    borderWidth > 0 &&
    borderColorObj.hex &&
    borderColorObj.opacity > 0 &&
    borderStyle !== "none" &&
    borderStyle !== "hidden";

  const borderInfo = getBorderInfo(style, config.scale);
  const hasUniformBorder = borderInfo.type === "uniform";
  const hasCompositeBorder = borderInfo.type === "composite";

  const shadowStr = style.boxShadow;
  const hasShadow = shadowStr && shadowStr !== "none";
  const softEdge = getSoftEdges(style.filter, style.backdropFilter, config.scale);

  let isImageWrapper = false;
  const imgChild = Array.from(node.children).find((c) => c.tagName === "IMG");
  if (imgChild) {
    const childW = imgChild.offsetWidth || imgChild.getBoundingClientRect().width;
    const childH = imgChild.offsetHeight || imgChild.getBoundingClientRect().height;
    if (childW >= widthPx - 2 && childH >= heightPx - 2) isImageWrapper = true;
  }

  let textPayload = null;
  const isText = isTextContainer(node);

  if (isText) {
    const textParts = [];
    let trimNextLeading = false;
    const hasBrTags = Array.from(node.childNodes).some((child) => child.tagName === "BR");
    let shouldUseNativeWrap = false;
    const childNodes = Array.from(node.childNodes);

    childNodes.forEach((child, index) => {
      // Handle <br> tags
      if (child.tagName === "BR") {
        // 1. Trim trailing space from the *previous* text part to prevent double wrapping
        if (textParts.length > 0) {
          const lastPart = textParts[textParts.length - 1];
          if (lastPart.text && typeof lastPart.text === "string") {
            lastPart.text = lastPart.text.trimEnd();
          }
        }

        textParts.push({ text: "", options: { breakLine: true } });

        // 2. Signal to trim leading space from the *next* text part
        trimNextLeading = true;
        return;
      }

      let textVal = child.nodeType === 3 ? child.nodeValue : child.textContent;
      const nodeStyle = child.nodeType === 1 ? window.getComputedStyle(child) : style;
      textVal = textVal.replace(/[\n\r\t]+/g, " ").replace(/\s{2,}/g, " ");

      // Trimming logic
      if (index === 0) textVal = textVal.trimStart();
      if (trimNextLeading) {
        textVal = textVal.trimStart();
        trimNextLeading = false;
      }

      if (index === childNodes.length - 1) textVal = textVal.trimEnd();
      if (nodeStyle.textTransform === "uppercase") textVal = textVal.toUpperCase();
      if (nodeStyle.textTransform === "lowercase") textVal = textVal.toLowerCase();

      if (textVal.length > 0) {
        const textOpts = getTextStyle(nodeStyle, config.scale);

        // BUG FIX: Numbers 1 and 2 having background.
        // If this is a naked Text Node (nodeType 3), it inherits style from the parent container.
        // The parent container's background is already rendered as the Shape Fill.
        // We must NOT render it again as a Text Highlight, otherwise it looks like a solid marker on top of the shape.
        if (child.nodeType === 3 && textOpts.highlight) {
          delete textOpts.highlight;
        }

        // Check if there's a line break between this node and the previous one
        // Only check for containers with <br> tags (for containers without <br>, we use detectLineBreaks later)
        let needsLeadingNewline = false;
        if (hasBrTags && index > 0 && !isNoWrap(style)) {
          const prevChild = childNodes[index - 1];
          // Skip BR tags when checking
          if (prevChild.tagName !== "BR") {
            needsLeadingNewline = detectLineBreakBetweenNodes(prevChild, child);
          }
        }

        // For containers with <br> tags, detect line breaks within each child node
        // For containers without <br> tags, we'll use detectLineBreaks on the whole container later
        if (hasBrTags && !isNoWrap(style)) {
          if (child.nodeType === 3) {
            // Text node - use detectLineBreaksForTextNode
            const nodeResult = detectLineBreaksForTextNode(child);
            if (nodeResult && nodeResult.breaks && nodeResult.breaks.length > 0) {
              const nodeText = nodeResult.processedText;
              const nodeBreaks = nodeResult.breaks;
              let lastEnd = 0;
              for (let bi = 0; bi < nodeBreaks.length; bi++) {
                const breakPos = nodeBreaks[bi];
                if (breakPos > lastEnd) {
                  const partText = nodeText.slice(lastEnd, breakPos).trimEnd();
                  if (partText.length > 0) {
                    textParts.push({ text: partText + "\n", options: { ...textOpts } });
                  }
                }
                lastEnd = breakPos;
              }
              if (lastEnd < nodeText.length) {
                const remainingText = nodeText.slice(lastEnd).trimStart();
                if (remainingText.length > 0) {
                  textParts.push({ text: remainingText, options: textOpts });
                }
              }
              return;
            }
          } else if (child.nodeType === 1) {
            // Inline element - use detectLineBreaksForInlineElement
            const elementResult = detectLineBreaksForInlineElement(child);
            if (elementResult && elementResult.breaks && elementResult.breaks.length > 0) {
              const elemText = elementResult.processedText;
              const elemBreaks = elementResult.breaks;
              let lastEnd = 0;
              for (let bi = 0; bi < elemBreaks.length; bi++) {
                const breakPos = elemBreaks[bi];
                if (breakPos > lastEnd) {
                  const partText = elemText.slice(lastEnd, breakPos).trimEnd();
                  if (partText.length > 0) {
                    textParts.push({ text: partText + "\n", options: { ...textOpts } });
                  }
                }
                lastEnd = breakPos;
              }
              if (lastEnd < elemText.length) {
                const remainingText = elemText.slice(lastEnd).trimStart();
                if (remainingText.length > 0) {
                  textParts.push({ text: remainingText, options: textOpts });
                }
              }
              return;
            }
          }
        }

        // Add newline at the start if there's a line break between nodes
        if (needsLeadingNewline) {
          textParts.push({ text: "\n" + textVal, options: textOpts });
        } else {
          textParts.push({ text: textVal, options: textOpts });
        }
      }
    });

    // Apply line break detection for text containers without <br> tags
    // This ensures PPTX text wraps at the same positions as HTML
    // Rich-text runs (e.g. plain text + styled <span>) are sensitive to font metric
    // differences between browser and PPT; forcing HTML-detected hard breaks here can
    // wrongly push an entire run to the next line.
    const hasRichTextRuns = textParts.length > 1;
    shouldUseNativeWrap = hasRichTextRuns && !hasBrTags && !isNoWrap(style);
    if (!hasBrTags && textParts.length > 0 && !isNoWrap(style) && !hasRichTextRuns) {
      const result = detectLineBreaks(node);
      if (result && result.breaks && result.breaks.length > 0) {
        // Build mapping from global position to textPart index and local position
        const partMap = [];
        let globalOffset = 0;
        for (let i = 0; i < textParts.length; i++) {
          const part = textParts[i];
          const text = part.text;
          for (let j = 0; j < text.length; j++) {
            partMap.push({ partIndex: i, localPos: j, globalPos: globalOffset + j });
          }
          globalOffset += text.length;
        }

        // Insert \n at break positions (from back to front to preserve indices)
        const breaks = result.breaks;
        for (let i = breaks.length - 1; i >= 0; i--) {
          const breakPos = breaks[i];
          if (breakPos <= 0) continue;

          // Do not force a hard line break exactly at rich-text run boundaries
          // (e.g. plain text followed by <span> styled text). In these cases,
          // browser line-box metrics can differ slightly and cause false-positive
          // breaks that push the whole span to the next line in PPT.
          const prevEntry = partMap[breakPos - 1];
          const nextEntry = partMap[breakPos];
          if (prevEntry && nextEntry && prevEntry.partIndex !== nextEntry.partIndex) {
            continue;
          }

          // Find which textPart contains the character before breakPos
          const entry = prevEntry;
          if (entry) {
            const part = textParts[entry.partIndex];
            // Insert \n after the character at local position
            part.text = part.text.slice(0, entry.localPos + 1) + "\n" + part.text.slice(entry.localPos + 1);
          }
        }
      }
    }

    if (textParts.length > 0) {
      let align = style.textAlign || "left";
      if (align === "start") align = "left";
      if (align === "end") align = "right";
      let valign = "top";

      const display = (style.display || "").toLowerCase();
      const isFlex = display === "flex" || display === "inline-flex";
      const flexDir = (style.flexDirection || "row").toLowerCase();
      const isFlexColumn = isFlex && flexDir.startsWith("column");

      // Map flex alignment to PPT text alignment.
      // - Flex row: justify-content affects horizontal, align-items affects vertical
      // - Flex column: justify-content affects vertical, align-items affects horizontal
      const mapMainAxisToAlign = (v) => {
        if (v === "center") return "center";
        if (v === "flex-end" || v === "end") return "right";
        return null;
      };
      const mapMainAxisToValign = (v) => {
        if (v === "center") return "middle";
        if (v === "flex-end" || v === "end") return "bottom";
        return null;
      };
      const mapCrossAxisToAlign = (v) => {
        if (v === "center") return "center";
        if (v === "flex-end" || v === "end") return "right";
        return null;
      };
      const mapCrossAxisToValign = (v) => {
        if (v === "center") return "middle";
        if (v === "flex-end" || v === "end") return "bottom";
        return null;
      };

      if (isFlex) {
        const jc = (style.justifyContent || "").toLowerCase();
        const ai = (style.alignItems || "").toLowerCase();

        if (isFlexColumn) {
          // Column: vertical center is justify-content, horizontal is align-items
          valign = mapMainAxisToValign(jc) || valign;
          align = mapCrossAxisToAlign(ai) || align;
        } else {
          // Row: horizontal center is justify-content, vertical is align-items
          align = mapMainAxisToAlign(jc) || align;
          valign = mapCrossAxisToValign(ai) || valign;
        }
      } else {
        // Non-flex elements may still use vertical-align (inline/table-cell semantics)
        if (style.verticalAlign === "middle") valign = "middle";
        if (style.verticalAlign === "bottom") valign = "bottom";
      }

      const pt = parseFloat(style.paddingTop) || 0;
      const pb = parseFloat(style.paddingBottom) || 0;
      const pl = parseFloat(style.paddingLeft) || 0;
      const pr = parseFloat(style.paddingRight) || 0;

      // Check if parent is a flex container with centering
      const parent = node.parentElement;
      if (parent) {
        const parentStyle = window.getComputedStyle(parent);
        const parentDisplay = (parentStyle.display || "").toLowerCase();
        const isParentFlex = parentDisplay === "flex" || parentDisplay === "inline-flex";
        if (isParentFlex) {
          const parentDir = (parentStyle.flexDirection || "row").toLowerCase();
          const parentIsColumn = parentDir.startsWith("column");
          const parentJc = (parentStyle.justifyContent || "").toLowerCase();
          const parentAi = (parentStyle.alignItems || "").toLowerCase();

          // Infer alignment from parent flex only when it clearly centers the child.
          if (parentIsColumn) {
            // Column parent: align-items centers horizontally; justify-content centers vertically
            align = mapCrossAxisToAlign(parentAi) || align;
            valign = mapMainAxisToValign(parentJc) || valign;
          } else {
            // Row parent: justify-content centers horizontally; align-items centers vertically
            align = mapMainAxisToAlign(parentJc) || align;
            valign = mapCrossAxisToValign(parentAi) || valign;
          }
        }
      }

      // If padding is symmetric, the content should be centered only when explicitly centered
      // Don't auto-center when the element has left-aligned content (default)
      const hasVisualBg =
        (bgColorObj.hex && bgColorObj.opacity > 0) ||
        (style.backgroundImage && style.backgroundImage !== "none") ||
        hasBorder;
      // Only center when there's explicit text-align: center
      const explicitTextAlign = style.textAlign;
      const shouldCenter = explicitTextAlign === "center" || explicitTextAlign === "justify";
      if (shouldCenter && Math.abs(pt - pb) < 2 && hasVisualBg) valign = "middle";
      if (shouldCenter && Math.abs(pl - pr) < 2 && hasVisualBg) align = "center";

      let padding = getPadding(style, config.scale);
      if (align === "center" && valign === "middle") padding = [0, 0, 0, 0];

      // Convert padding from inches to points (PptxGenJS expects points for margin)
      const paddingPts = padding.map((p) => p * 72); // [top, right, bottom, left]
      // pptxgenjs v3.x maps margin array to l/r/b/t (not t/r/b/l).
      // Work around by reordering to [left, right, bottom, top] so CSS padding-left becomes PPT lIns.
      const [tMar, rMar, bMar, lMar] = paddingPts;
      const pptMargin = [lMar, rMar, bMar, tMar];

      textPayload = { text: textParts, align, valign, margin: pptMargin, shouldUseNativeWrap };
    }
  }

  // background-size + multi-gradient 的平铺纹理（如 60px 网格）：
  // 只将“背景层”转成位图，子元素继续按常规流程渲染，保持可编辑性。
  if (isTiledGradientPattern) {
    const item = {
      type: "image",
      zIndex,
      domOrder,
      options: { x, y, w, h, rotate: rotation, data: null },
    };
    const job = async () => {
      const pngData = await elementBackgroundToCanvasImage(node, widthPx, heightPx);
      if (pngData) item.options.data = pngData;
      else item.skip = true;
    };
    return { items: [item], job, stopRecursion: false };
  }

  if (hasGradient || (softEdge && bgColorObj.hex && !isImageWrapper)) {
    let bgData = null;
    let padIn = 0;

    if (softEdge) {
      const svgInfo = generateBlurredSVG(
        widthPx,
        heightPx,
        bgColorObj.hex,
        bgColorObj.opacity,
        borderRadiusValue,
        softEdge
      );
      bgData = svgInfo.data;
      padIn = svgInfo.padding * PX_TO_INCH * config.scale;
    } else {
      const flattenRootBg = shouldFlattenRootBgGradient(node, style, config);
      const gradientResult = generateGradientSVG(
        widthPx,
        heightPx,
        style.backgroundImage,
        hasPartialBorderRadius ? borderRadii : borderRadiusValue,
        hasBorder ? { color: borderColorObj.hex, width: borderWidth } : null,
        {
          // 仅对“根节点下的全覆盖绝对定位背景层”做透明度预混合，
          // 避免 PPT 对透明渐变 PNG 的显示偏差。
          flattenAlphaToBgHex: flattenRootBg ? config.slideBgHex : null,
        }
      );

      // Handle async PNG conversion for gradients with transparency
      if (gradientResult && gradientResult.needsPngConversion) {
        const item = {
          type: "image",
          zIndex,
          domOrder,
          options: {
            data: null,
            x: x - padIn,
            y: y - padIn,
            w: w + padIn * 2,
            h: h + padIn * 2,
            rotate: rotation,
          },
        };
        items.push(item);
        gradientJob = async () => {
          const pngData = await svgStringToPng(gradientResult.svg, gradientResult.width, gradientResult.height);
          if (pngData) {
            item.options.data = pngData;
          } else {
            item.skip = true;
          }
        };
      } else {
        bgData = gradientResult;
      }
    }

    if (bgData) {
      items.push({
        type: "image",
        zIndex,
        domOrder,
        options: {
          data: bgData,
          x: x - padIn,
          y: y - padIn,
          w: w + padIn * 2,
          h: h + padIn * 2,
          rotate: rotation,
        },
      });
    }

    if (textPayload) {
      textPayload.text[0].options.fontSize = Math.floor(textPayload.text[0]?.options?.fontSize) || 12;
      items.push({
        type: "text",
        zIndex: zIndex + 1,
        domOrder,
        textParts: textPayload.text,
        options: {
          x,
          y,
          w,
          h,
          align: textPayload.align,
          valign: textPayload.valign,
          margin: textPayload.margin,
          rotate: rotation,
          wrap: !!textPayload.shouldUseNativeWrap,
          autoFit: false,
        },
      });
    }
    if (hasCompositeBorder) {
      const borderItems = createCompositeBorderItems(borderInfo.sides, x, y, w, h, config.scale, zIndex, domOrder);
      items.push(...borderItems);
    }
  } else if (
    (bgColorObj.hex && !isImageWrapper) ||
    hasUniformBorder ||
    hasCompositeBorder ||
    hasShadow ||
    textPayload
  ) {
    const finalAlpha = safeOpacity * bgColorObj.opacity;
    const transparency = (1 - finalAlpha) * 100;
    // Skip background fill for root element (already set as slide.background)
    const isRootElement = node === config.root;

    // 对所有有背景色的容器（包括仅包含 table 的容器），都按 DOM 尺寸渲染背景，
    // 让 PPT 中的卡片高度与浏览器一致；表格本身的高度由 PowerPoint 控制，
    // 允许它比背景略短（等效于有内边距的卡片）。
    const useSolidFill = bgColorObj.hex && !isImageWrapper && !isRootElement;

    if (hasPartialBorderRadius && useSolidFill) {
      const shapeSvg = generateCustomShapeSVG(widthPx, heightPx, bgColorObj.hex, bgColorObj.opacity, borderRadii);

      items.push({
        type: "image",
        zIndex,
        domOrder,
        options: { data: shapeSvg, x, y, w, h, rotate: rotation },
      });

      if (textPayload) {
        textPayload.text[0].options.fontSize = Math.floor(textPayload.text[0]?.options?.fontSize) || 12;
        items.push({
          type: "text",
          zIndex: zIndex + 1,
          domOrder,
          textParts: textPayload.text,
          options: {
            x,
            y,
            w,
            h,
            align: textPayload.align,
            valign: textPayload.valign,
            margin: textPayload.margin,
            rotate: rotation,
            wrap: !!textPayload.shouldUseNativeWrap,
            autoFit: false,
          },
        });
      }
    } else {
      const shapeOpts = {
        x,
        y,
        w,
        h,
        rotate: rotation,
        fill: useSolidFill ? { color: bgColorObj.hex, transparency: transparency } : { type: "none" },
        line: hasUniformBorder ? borderInfo.options : null,
      };

      if (hasShadow) shapeOpts.shadow = getVisibleShadow(shadowStr, config.scale);

      // 1. Calculate dimensions first
      const minDimension = Math.min(widthPx, heightPx);

      const rawRadius = parseFloat(style.borderRadius) || 0;
      const isPercentage = style.borderRadius && style.borderRadius.toString().includes("%");

      // 2. Normalize radius to pixels
      let radiusPx = rawRadius;
      if (isPercentage) {
        radiusPx = (rawRadius / 100) * minDimension;
      }

      let shapeType = pptx.ShapeType.rect;

      // 3. Determine Shape Logic
      const isSquare = Math.abs(widthPx - heightPx) < 1;
      const isFullyRound = radiusPx >= minDimension / 2;

      // CASE A: It is an Ellipse if:
      // 1. It is explicitly "50%" (standard CSS way to make ovals/circles)
      // 2. OR it is a perfect square and fully rounded (a circle)
      if (isFullyRound && (isPercentage || isSquare)) {
        shapeType = pptx.ShapeType.ellipse;
      }
      // CASE B: It is a Rounded Rectangle (including "Pill" shapes)
      else if (radiusPx > 0) {
        shapeType = pptx.ShapeType.roundRect;
        let r = radiusPx / minDimension;
        if (r > 0.5) r = 0.5;
        if (minDimension < 100) r = r * 0.25; // Small size adjustment for small shapes

        shapeOpts.rectRadius = r;
      }

      if (textPayload) {
        textPayload.text[0].options.fontSize = Math.floor(textPayload.text[0]?.options?.fontSize) || 12;

        // Original behavior: text with shape background
        const textOptions = {
          shape: shapeType,
          ...shapeOpts,
          x,
          w,
          rotate: rotation,
          align: textPayload.align,
          valign: textPayload.valign,
          margin: textPayload.margin,
          wrap: !!textPayload.shouldUseNativeWrap,
          autoFit: false,
        };
        items.push({
          type: "text",
          zIndex,
          domOrder,
          textParts: textPayload.text,
          options: textOptions,
        });
      } else if (!hasPartialBorderRadius) {
        items.push({
          type: "shape",
          zIndex,
          domOrder,
          shapeType,
          options: shapeOpts,
        });
      }
    }

    if (hasCompositeBorder && !hasPartialBorderRadius) {
      const borderSvgData = generateCompositeBorderSVG(widthPx, heightPx, borderRadiusValue, borderInfo.sides);
      if (borderSvgData) {
        items.push({
          type: "image",
          zIndex: zIndex + 1,
          domOrder,
          options: { data: borderSvgData, x, y, w, h, rotate: rotation },
        });
      }
    }
  }

  return { items, job: gradientJob, stopRecursion: !!textPayload };
}

function isComplexHierarchy(root) {
  // Use a simple tree traversal to find forbidden elements in the list structure
  const stack = [root];
  while (stack.length > 0) {
    const el = stack.pop();

    // 1. Layouts: Flex/Grid on LIs
    if (el.tagName === "LI") {
      const s = window.getComputedStyle(el);
      if (s.display === "flex" || s.display === "grid" || s.display === "inline-flex") return true;
    }

    // 2. Media / Icons
    if (["IMG", "SVG", "CANVAS", "VIDEO", "IFRAME"].includes(el.tagName)) return true;
    if (isIconElement(el)) return true;

    // 3. Nested Lists (Flattening logic doesn't support nested bullets well yet)
    if (el !== root && (el.tagName === "UL" || el.tagName === "OL")) return true;

    // Recurse, but don't go too deep if not needed
    for (let i = 0; i < el.children.length; i++) {
      stack.push(el.children[i]);
    }
  }
  return false;
}

function collectListParts(node, parentStyle, scale) {
  const parts = [];

  // Check for CSS Content (::before) - often used for icons
  if (node.nodeType === 1) {
    const beforeStyle = window.getComputedStyle(node, "::before");
    const content = beforeStyle.content;
    if (content && content !== "none" && content !== "normal" && content !== '""') {
      // Strip quotes
      const cleanContent = content.replace(/^['"]|['"]$/g, "");
      if (cleanContent.trim()) {
        parts.push({
          text: cleanContent + " ", // Add space after icon
          options: getTextStyle(window.getComputedStyle(node), scale),
        });
      }
    }
  }

  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      // Text
      const val = child.nodeValue
        .replace(/[\n\r\t]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (val) {
        // Use parent style if child is text node, otherwise current style
        const styleToUse = node.nodeType === 1 ? window.getComputedStyle(node) : parentStyle;
        parts.push({
          text: val,
          options: getTextStyle(styleToUse, scale),
        });
      }
    } else if (child.nodeType === 1) {
      // Element (span, i, b)
      // Recurse
      parts.push(...collectListParts(child, parentStyle, scale));
    }
  });

  return parts;
}

function createCompositeBorderItems(sides, x, y, w, h, scale, zIndex, domOrder) {
  const items = [];
  const pxToInch = 1 / 96;
  const common = { zIndex: zIndex + 1, domOrder, shapeType: "rect" };

  if (sides.top.width > 0)
    items.push({
      ...common,
      options: { x, y, w, h: sides.top.width * pxToInch * scale, fill: { color: sides.top.color } },
    });
  if (sides.right.width > 0)
    items.push({
      ...common,
      options: {
        x: x + w - sides.right.width * pxToInch * scale,
        y,
        w: sides.right.width * pxToInch * scale,
        h,
        fill: { color: sides.right.color },
      },
    });
  if (sides.bottom.width > 0)
    items.push({
      ...common,
      options: {
        x,
        y: y + h - sides.bottom.width * pxToInch * scale,
        w,
        h: sides.bottom.width * pxToInch * scale,
        fill: { color: sides.bottom.color },
      },
    });
  if (sides.left.width > 0)
    items.push({
      ...common,
      options: {
        x,
        y,
        w: sides.left.width * pxToInch * scale,
        h,
        fill: { color: sides.left.color },
      },
    });

  return items;
}

/**
 * Worker function to process a single DOM element into a single PPTX slide.
 * @param {HTMLElement} root - The root element for this slide.
 * @param {PptxGenJS.Slide} slide - The PPTX slide object to add content to.
 * @param {PptxGenJS} pptx - The main PPTX instance.
 * @param {Object} globalOptions - Global options.
 * @param {number} pageNum - Page number (1-indexed) for title lookup.
 */
export async function processSlide(root, slide, pptx, globalOptions = {}, pageNum = 1) {
  const rootRect = root.getBoundingClientRect();
  const PPTX_WIDTH_IN = 10;
  const PPTX_HEIGHT_IN = 5.625;

  const contentWidthIn = rootRect.width * PX_TO_INCH;
  const contentHeightIn = rootRect.height * PX_TO_INCH;
  const scale = Math.min(PPTX_WIDTH_IN / contentWidthIn, PPTX_HEIGHT_IN / contentHeightIn);

  const layoutConfig = {
    rootX: rootRect.x,
    rootY: rootRect.y,
    scale: scale,
    offX: (PPTX_WIDTH_IN - contentWidthIn * scale) / 2,
    offY: (PPTX_HEIGHT_IN - contentHeightIn * scale) / 2,
  };

  // Extract root element background-color and set as slide background
  // Note: background-image (gradient or url) is handled as regular image element in prepareRenderItem
  const rootStyle = window.getComputedStyle(root);
  const bgColorObj = parseColor(rootStyle.backgroundColor);
  let slideBgHex = null;
  if (bgColorObj.hex && bgColorObj.opacity > 0) {
    slide.background = { color: bgColorObj.hex };
    slideBgHex = bgColorObj.hex;
  } else {
    // 渐变背景回退处理（防止透明叠加显示白色）
    const bgImg = rootStyle.backgroundImage || "";
    if (bgImg && bgImg !== "none" && /gradient\(/.test(bgImg)) {
      const fallback = getGradientFallbackColor(bgImg);
      const fallbackObj = parseColor(fallback);
      if (fallbackObj.hex && fallbackObj.opacity > 0) {
        slide.background = { color: fallbackObj.hex };
        slideBgHex = fallbackObj.hex;
      }
    } else {
      // 如果根元素背景透明，扫描子元素查找渐变背景（用于 Tailwind 渐变 div 情况）
      // 这修复了渐变 div 作为子元素时，透明部分显示白色而非深色的问题
      const fullCoverageGradientChild = Array.from(root.children).find((child) => {
        const childStyle = window.getComputedStyle(child);
        const childBgImg = childStyle.backgroundImage || "";
        const isAbsoluteFullCoverage = childStyle.position === "absolute" &&
          childStyle.inset === "0px";
        return isAbsoluteFullCoverage && childBgImg && childBgImg !== "none" && /gradient\(/.test(childBgImg);
      });

      if (fullCoverageGradientChild) {
        const childBgImg = window.getComputedStyle(fullCoverageGradientChild).backgroundImage;
        const fallback = getGradientFallbackColor(childBgImg);
        const fallbackObj = parseColor(fallback);
        if (fallbackObj.hex && fallbackObj.opacity > 0) {
          slide.background = { color: fallbackObj.hex };
          slideBgHex = fallbackObj.hex;
        }
      }
    }
  }

  const renderQueue = [];
  const asyncTasks = []; // Queue for heavy operations (Images, Canvas)
  let domOrderCounter = 0;

  // Sync Traversal Function
  function collect(node, parentZIndex) {
    const order = domOrderCounter++;

    let currentZ = parentZIndex;
    let nodeStyle = null;
    const nodeType = node.nodeType;

    if (nodeType === 1) {
      nodeStyle = window.getComputedStyle(node);
      // Optimization: Skip completely hidden elements immediately
      if (nodeStyle.display === "none" || nodeStyle.visibility === "hidden" || nodeStyle.opacity === "0") {
        return;
      }
      if (nodeStyle.zIndex !== "auto") {
        currentZ = parseInt(nodeStyle.zIndex);
      }
    }

    // Prepare the item. If it needs async work, it returns a 'job'
    const result = prepareRenderItem(
      node,
      { ...layoutConfig, root, slideBgHex },
      order,
      pptx,
      slide,
      currentZ,
      nodeStyle,
      globalOptions
    );

    if (result) {
      if (result.items) {
        // Push items immediately to queue (data might be missing but filled later)
        renderQueue.push(...result.items);
      }
      if (result.job) {
        // Push the promise-returning function to the task list
        asyncTasks.push(result.job);
      }
      if (result.stopRecursion) return;
    }

    // Recurse children synchronously
    const childNodes = node.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
      collect(childNodes[i], currentZ);
    }
  }

  // 1. Traverse and build the structure (Fast)
  collect(root, 0);

  // 2. Execute all heavy tasks in parallel (Fast)
  if (asyncTasks.length > 0) {
    await Promise.all(asyncTasks.map((task) => task()));
  }

  // 3. Cleanup and Sort
  // Remove items that failed to generate data (marked with skip)
  const finalQueue = renderQueue.filter((item) => !item.skip && (item.type !== "image" || item.options.data));

  finalQueue.sort((a, b) => {
    if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
    return a.domOrder - b.domOrder;
  });

  // 4. Add to Slide
  for (const item of finalQueue) {
    if (item.type === "shape") slide.addShape(item.shapeType, item.options);
    if (item.type === "image") slide.addImage(item.options);
    if (item.type === "text") slide.addText(item.textParts, item.options);
    if (item.type === "table") {
      slide.addTable(item.tableData.rows, {
        x: item.options.x,
        y: item.options.y,
        w: item.options.w,
        colW: item.tableData.colWidths,
        rowH: item.tableData.rowHeights,
        autoPage: false,
      });
    }
    // 处理 SVG 可编辑对象：将转换后的对象数组按顺序添加到幻灯片
    if (item.type === "svg-editable" && Array.isArray(item.options.data)) {
      for (const obj of item.options.data) {
        if (obj.type === 'shape') {
          slide.addShape(obj.shapeType, obj.options);
        } else if (obj.type === 'text') {
          slide.addText(obj.text, obj.options);
        } else if (obj.type === 'image') {
          slide.addImage(obj.options);
        } else if (obj.type === 'line') {
          slide.addLine(obj.options);
        }
      }
    }
  }
}
