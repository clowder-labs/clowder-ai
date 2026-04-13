# 格式转换规则

## 目录
- [支持矩阵](#支持矩阵)
- [转换规则](#转换规则)
- [批量转换配置](#批量转换配置)
- [注意事项](#注意事项)

## 概览
本文档定义了多格式批量转换的支持矩阵、转换规则和配置参数。

---

## 支持矩阵

| 输入格式 | 输出格式 | 是否支持 | 说明 |
|---------|---------|---------|------|
| Word (.docx/.doc) | PDF | ✓ | 保留格式、布局 |
| Word (.docx/.doc) | PNG | ✓ | 每页一张图片 |
| Word (.docx/.doc) | JPG | ✓ | 每页一张图片 |
| Excel (.xlsx/.xls) | PDF | ✓ | 保留表格格式 |
| Excel (.xlsx/.xls) | CSV | ✓ | 仅保留数据 |
| PPT (.pptx/.ppt) | PDF | ✓ | 保留幻灯片布局 |
| PPT (.pptx/.ppt) | PNG | ✓ | 每页一张图片 |
| PPT (.pptx/.ppt) | JPG | ✓ | 每页一张图片 |
| PDF | PNG | ✓ | 每页一张图片 |
| PDF | JPG | ✓ | 每页一张图片 |

---

## 转换规则

### Word → PDF
**转换方法**：
1. **LibreOffice**（推荐）：跨平台，支持所有格式
2. **Win32COM**（Windows）：使用 Microsoft Word 自动化
3. **Python 库**：使用 python-docx + reportlab（简化版本）

**格式保留**：
- ✓ 文本格式（字体、大小、颜色）
- ✓ 段落格式（对齐、缩进）
- ✓ 表格结构
- ✓ 页眉页脚
- ✗ 复杂图形（部分支持）

### Excel → PDF
**转换方法**：
1. **LibreOffice**（推荐）
2. **Win32COM**（Windows）
3. **Python 库**：使用 openpyxl + reportlab（简化版本）

**格式保留**：
- ✓ 单元格数据
- ✓ 基本格式（字体、边框、填充）
- ✓ 表格结构
- ✗ 图表（LibreOffice 支持）
- ✗ 条件格式

### Excel → CSV
**转换方法**：pandas

**格式保留**：
- ✓ 单元格数据
- ✗ 所有格式信息
- ✗ 公式（仅保留计算结果）

### PPT → PDF
**转换方法**：
1. **LibreOffice**（推荐）
2. **Win32COM**（Windows）
3. **Python 库**：使用 python-pptx + reportlab（简化版本）

**格式保留**：
- ✓ 幻灯片内容
- ✓ 文本格式
- ✓ 图片
- ✗ 动画效果
- ✗ 音视频

### PPT → 图片
**转换方法**：
1. **LibreOffice + pdf2image**（推荐）
2. **Win32COM**（Windows）

**输出格式**：
- PNG：无损压缩，适合文本内容
- JPG：有损压缩，适合图片内容

**命名规则**：
```
原文件名_page1.png
原文件名_page2.png
原文件名_page3.png
...
```

---

## 批量转换配置

### 参数说明
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| input_files | List[str] | 是 | - | 输入文件路径列表 |
| output_format | str | 是 | - | 目标格式（pdf/png/jpg/csv） |
| output_dir | str | 否 | "./output" | 输出目录 |
| preserve_format | bool | 否 | True | 是否保留格式 |

### 配置示例

#### 示例 1：Word 合同批量转 PDF
```json
{
  "input_files": [
    "/data/contracts/合同1.docx",
    "/data/contracts/合同2.docx",
    "/data/contracts/合同3.docx"
  ],
  "output_format": "pdf",
  "output_dir": "/data/output",
  "preserve_format": true
}
```

**执行命令**：
```bash
python format_converter.py \
  --input /data/contracts/合同1.docx /data/contracts/合同2.docx /data/contracts/合同3.docx \
  --format pdf \
  --output-dir /data/output \
  --preserve-format
```

#### 示例 2：PPT 课件转 PNG
```json
{
  "input_files": [
    "/data/slides/培训课件.pptx"
  ],
  "output_format": "png",
  "output_dir": "/data/output",
  "preserve_format": true
}
```

**执行命令**：
```bash
python format_converter.py \
  --input /data/slides/培训课件.pptx \
  --format png \
  --output-dir /data/output
```

**输出结果**：
```
/data/output/培训课件_page1.png
/data/output/培训课件_page2.png
/data/output/培训课件_page3.png
...
```

#### 示例 3：Excel 报表转 CSV
```json
{
  "input_files": [
    "/data/reports/销售数据.xlsx",
    "/data/reports/库存数据.xlsx"
  ],
  "output_format": "csv",
  "output_dir": "/data/output"
}
```

**执行命令**：
```bash
python format_converter.py \
  --input /data/reports/销售数据.xlsx /data/reports/库存数据.xlsx \
  --format csv \
  --output-dir /data/output
```

---

## 注意事项

### 1. 转换方法优先级
系统自动检测可用的转换方法，优先级顺序：
1. **LibreOffice**：跨平台，功能最全
2. **Win32COM**：Windows 专用，需安装 Office
3. **Python 库**：备选方案，功能简化

### 2. 格式保留限制
- **简化版本**（Python 库）：仅支持基本格式
- **完整版本**（LibreOffice/Win32COM）：支持大部分格式

### 3. 批量转换性能
- **小文件**（< 1MB）：单文件约 1-3 秒
- **中等文件**（1-10MB）：单文件约 3-10 秒
- **大文件**（> 10MB）：单文件约 10-30 秒

**建议**：
- 超过 50 个文件时，建议分批处理
- 大文件建议单个处理，避免内存溢出

### 4. 文件命名冲突
当输出目录存在同名文件时：
- 自动添加序号后缀（如：文件_1.pdf）
- 或覆盖原文件（需用户确认）

### 5. 中文路径支持
- ✓ Windows：完全支持
- ✓ macOS：完全支持
- ✓ Linux：需确保系统编码为 UTF-8

### 6. 错误处理
转换失败时，系统会：
1. 记录错误信息
2. 继续处理下一个文件
3. 最后返回成功和失败的文件列表

---

## 常见问题

### Q1：转换后格式错乱怎么办？
**A**：优先使用 LibreOffice 或 Win32COM 转换方法。检查原文档是否包含特殊格式（如艺术字、SmartArt）。

### Q2：PPT 转图片失败怎么办？
**A**：确保安装了 pdf2image 库和 poppler 工具：
```bash
pip install pdf2image
# Ubuntu
apt-get install poppler-utils
# macOS
brew install poppler
```

### Q3：批量转换速度慢怎么办？
**A**：
1. 使用更快的存储设备（SSD）
2. 关闭不必要的格式保留选项
3. 分批处理，避免一次性处理过多文件

### Q4：CSV 导出乱码怎么办？
**A**：脚本默认使用 UTF-8-BOM 编码，兼容 Excel 打开。如需其他编码，可在脚本中修改。

---

## 验证规则

1. **输入文件存在性**：所有输入文件必须存在
2. **格式支持性**：输入输出格式必须在支持矩阵中
3. **输出目录**：如不存在，自动创建
4. **文件权限**：必须有读取输入文件和写入输出目录的权限
