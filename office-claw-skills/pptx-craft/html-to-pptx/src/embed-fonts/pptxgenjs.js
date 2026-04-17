import JSZip from "jszip";
import pptxgenjs from "pptxgenjs";
import PPTXEmbedFonts from "./index.js";
import { normalizeBuffer, renameTTFInPlace } from "./utils.js";
import { initWoff2 } from "./woff2.js";

// OOXML 命名空间
const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";

/**
 * 向 ZIP 中的每页 slide XML 注入隐藏水印节点
 * 水印信息存储在 <p:cNvPr name="wm:原始文本"> 属性中，
 * PowerPoint 中完全不可见，需解压 .pptx 查看 XML 才能发现。
 * @param {JSZip} zip - 已加载 PPTX 的 JSZip 实例
 * @param {string} watermarkText - 水印文本
 */
async function injectWatermarkToSlides(zip, watermarkText) {
  const markerName = `wm:${watermarkText}`;

  // 匹配 ppt/slides/slide1.xml, slide2.xml, ...（排除 slideLayout/slideMaster）
  const slideFiles = [];
  zip.forEach((relativePath, file) => {
    if (/^ppt\/slides\/slide\d+\.xml$/.test(relativePath) && !file.dir) {
      slideFiles.push(relativePath);
    }
  });

  for (const path of slideFiles) {
    const slideFile = zip.file(path);
    if (!slideFile) continue;

    const xmlStr = await slideFile.async("string");
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, "text/xml");

    const spTree = doc.getElementsByTagNameNS(NS_P, "spTree")[0];
    if (!spTree) continue;

    // 构造隐藏水印 <p:sp> 节点
    const sp = doc.createElementNS(NS_P, "p:sp");

    // --- nvSpPr ---
    const nvSpPr = doc.createElementNS(NS_P, "p:nvSpPr");
    const cNvPr = doc.createElementNS(NS_P, "p:cNvPr");
    cNvPr.setAttribute("id", "65535");
    cNvPr.setAttribute("name", markerName);
    nvSpPr.appendChild(cNvPr);

    const cNvSpPr = doc.createElementNS(NS_P, "p:cNvSpPr");
    nvSpPr.appendChild(cNvSpPr);

    const nvPr = doc.createElementNS(NS_P, "p:nvPr");
    nvSpPr.appendChild(nvPr);
    sp.appendChild(nvSpPr);

    // --- spPr（零尺寸、无填充、无线条）---
    const spPr = doc.createElementNS(NS_P, "p:spPr");

    const xfrm = doc.createElementNS(NS_A, "a:xfrm");
    const off = doc.createElementNS(NS_A, "a:off");
    off.setAttribute("x", "0");
    off.setAttribute("y", "0");
    xfrm.appendChild(off);
    const ext = doc.createElementNS(NS_A, "a:ext");
    ext.setAttribute("cx", "0");
    ext.setAttribute("cy", "0");
    xfrm.appendChild(ext);
    spPr.appendChild(xfrm);

    const prstGeom = doc.createElementNS(NS_A, "a:prstGeom");
    prstGeom.setAttribute("prst", "rect");
    const avLst = doc.createElementNS(NS_A, "a:avLst");
    prstGeom.appendChild(avLst);
    spPr.appendChild(prstGeom);

    const noFill = doc.createElementNS(NS_A, "a:noFill");
    spPr.appendChild(noFill);

    const ln = doc.createElementNS(NS_A, "a:ln");
    const lnNoFill = doc.createElementNS(NS_A, "a:noFill");
    ln.appendChild(lnNoFill);
    spPr.appendChild(ln);

    sp.appendChild(spPr);

    // 插入到 spTree 的末尾
    spTree.appendChild(sp);

    // 写回 ZIP
    const serializer = new XMLSerializer();
    zip.file(path, serializer.serializeToString(doc));
  }
}

/**
 * 字体嵌入增强的 pptxgenjs 包装器
 * @param {typeof pptxgenjs} pptxgen - 原始 pptxgenjs 类
 * @returns {typeof EmbedFontsPPTXGenJS} 增强后的 pptxgenjs 类
 */
function withPPTXEmbedFonts(pptxgen) {
  return class EmbedFontsPPTXGenJS extends pptxgen {
    _pptxEmbedFonts = new PPTXEmbedFonts();

    constructor(...args) {
      super(...args);
      this._setupExportPresentation();
    }

    _setupExportPresentation() {
      const originalExportPresentation = this.exportPresentation;

      this.exportPresentation = async (options = {}) => {
        // 调用原始导出方法
        const res = await originalExportPresentation.call(this, options);

        // 如果结果不是有效数据，直接返回
        if (!res) {
          return res;
        }

        try {
          // 加载到 JSZip
          const zip = await new JSZip().loadAsync(res);

          // 嵌入字体
          await this._pptxEmbedFonts.loadZip(zip);
          await this._pptxEmbedFonts.updateFiles();

          // 注入隐藏水印
          if (this._watermark) {
            await injectWatermarkToSlides(zip, this._watermark);
          }

          // 根据输出类型生成返回结果
          if (options.outputType === "STREAM") {
            return await zip.generateAsync({
              type: "nodebuffer",
              compression: options.compression ? "DEFLATE" : "STORE",
            });
          } else if (options.outputType) {
            return await zip.generateAsync({
              type: options.outputType,
            });
          } else {
            return await zip.generateAsync({
              type: "blob",
              compression: options.compression ? "DEFLATE" : "STORE",
            });
          }
        } catch (e) {
          console.error("[font] exportPresentation error:", e);
          // 如果嵌入字体失败，返回原始结果
          return res;
        }
      };
    }

    /**
     * 添加字体
     * @param {{ fontFace: string, fontFile: ArrayBuffer, fontType: "ttf" | "eot" | "woff" | "woff2" | "otf" }} options
     */
    async addFont(options) {
      if (options.fontType === "ttf") {
        await this._pptxEmbedFonts.addFontFromTTF(options.fontFace, options.fontFile);
      } else if (options.fontType === "eot") {
        await this._pptxEmbedFonts.addFontFromEOT(options.fontFace, options.fontFile);
      } else if (options.fontType === "woff") {
        await this._pptxEmbedFonts.addFontFromWOFF(options.fontFace, options.fontFile);
      } else if (options.fontType === "woff2") {
        // woff2: 解码后直接嵌入为 TTF（跳过 EOT 转换）
        const mod = await initWoff2();
        const decoded = mod.decode(options.fontFile);
        const ttfBuffer = normalizeBuffer(decoded);
        // 修复 TTF：重命名 name 表 + 修复 maxp.numGlyphs
        const renamedBuffer = renameTTFInPlace(ttfBuffer, options.fontFace);
        await this._pptxEmbedFonts.addFontFromRawTTF(options.fontFace, renamedBuffer);
      } else if (options.fontType === "otf") {
        await this._pptxEmbedFonts.addFontFromOTF(options.fontFace, options.fontFile);
      } else {
        throw new Error(`Invalid font type ${options.fontType}`);
      }
    }

    /**
     * 获取字体信息
     * @param {ArrayBuffer} fontFile - 字体文件数据
     * @returns {opentype.Font}
     */
    getFontInfo(fontFile) {
      return this._pptxEmbedFonts.getFontInfo(fontFile);
    }
  };
}

export default withPPTXEmbedFonts;
export { withPPTXEmbedFonts };
