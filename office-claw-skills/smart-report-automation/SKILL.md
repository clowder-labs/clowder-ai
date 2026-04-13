---
name: smart-report-automation
description: 实现Excel报表自动化处理与多格式批量转换；支持数据计算、格式美化、图表生成、PDF导出；适用于日报周报自动化、合同批量转PDF、课件转图片等场景
dependency:
  python:
    - openpyxl>=3.1.0
    - pandas>=2.0.0
    - python-pptx>=0.6.21
    - python-docx>=0.8.11
    - pillow>=10.0.0
    - xlsxwriter>=3.1.0
---

# Excel 智能报表自动化

## 任务目标
- 本 Skill 用于：自动化生成专业报表，批量转换办公文档格式
- 能力包含：数据计算与汇总、格式美化、图表生成、多格式转换（Word/Excel/PPT ↔ PDF/图片）
- 触发条件：用户需要自动化制作报表、批量转换文件格式、生成带图表的数据报告

## 前置准备
- 依赖说明：scripts 脚本所需的依赖包
  ```
  openpyxl>=3.1.0
  pandas>=2.0.0
  python-pptx>=0.6.21
  python-docx>=0.8.11
  pillow>=10.0.0
  xlsxwriter>=3.1.0
  ```

## 操作步骤

### 场景一：Excel 报表自动化

**步骤 1：准备数据与配置**
- 智能体读取用户上传的 Excel 文件，理解数据结构
- 根据用户需求，参考 [excel-format-spec.md](references/excel-format-spec.md) 确定格式配置
- 根据可视化需求，参考 [chart-config-guide.md](references/chart-config-guide.md) 确定图表配置

**步骤 2：执行报表处理**
- 调用 `scripts/excel_processor.py` 执行数据处理
- 支持的计算类型：
  - 求和（sum）、平均值（average）、计数（count）
  - 最大值（max）、最小值（min）
  - 数据透视（pivot_table）
- 格式美化功能：
  - 字体设置（名称、大小、颜色、加粗）
  - 边框样式（细线、粗线、双边框）
  - 单元格填充（背景色、渐变）
  - 条件格式（数据条、色阶、图标集）
- 图表生成：
  - 柱状图、折线图、饼图、散点图、面积图
  - 可自定义标题、图例、坐标轴

**步骤 3：导出与输出**
- 生成处理后的 Excel 文件
- 可选：自动导出为 PDF 格式

### 场景二：多格式批量转换

**步骤 1：识别文件类型**
- 智能体扫描输入文件，识别文件格式（Word/Excel/PPT）
- 参考 [conversion-rules.md](references/conversion-rules.md) 确定转换规则

**步骤 2：执行批量转换**
- 调用 `scripts/format_converter.py` 执行格式转换
- 支持的转换路径：
  - Word → PDF、图片（PNG/JPG）
  - Excel → PDF、CSV
  - PPT → PDF、图片（PNG/JPG，每页一张）
- 批量处理：支持一次性转换多个文件

**步骤 3：输出结果**
- 所有转换后的文件保存到指定目录
- 返回文件路径列表供用户下载

## 资源索引

### 必要脚本
- [scripts/excel_processor.py](scripts/excel_processor.py)：Excel 报表自动化处理（数据计算、格式美化、图表生成）
- [scripts/format_converter.py](scripts/format_converter.py)：多格式批量转换（Word/Excel/PPT ↔ PDF/图片）

### 领域参考
- [references/excel-format-spec.md](references/excel-format-spec.md)：Excel 格式配置规范（何时读取：需要设置单元格格式时）
- [references/chart-config-guide.md](references/chart-config-guide.md)：图表配置指南（何时读取：需要生成图表时）
- [references/conversion-rules.md](references/conversion-rules.md)：格式转换规则（何时读取：需要批量转换文件格式时）

## 使用示例

### 示例 1：生成带图表的日活报表
```
用户请求：根据每日用户数据，生成包含折线图的日活报表

执行流程：
1. 智能体读取数据文件，分析数据结构
2. 配置计算任务：计算日活均值、峰值
3. 配置图表：折线图显示日活趋势
4. 调用 excel_processor.py 生成报表
5. 输出 Excel 文件（可选 PDF）
```

### 示例 2：批量转换 Word 合同为 PDF
```
用户请求：将 100 份 Word 合同批量转换为 PDF

执行流程：
1. 智能体扫描指定目录的 .docx 文件
2. 调用 format_converter.py 批量转换
3. 所有 PDF 文件保存到输出目录
```

### 示例 3：PPT 课件转图片
```
用户请求：将 PPT 课件转换为 PNG 图片用于线上课程

执行流程：
1. 智能体读取 PPT 文件
2. 调用 format_converter.py 转换为图片（每页一张）
3. 输出图片序列到指定目录
```

## 注意事项
- 格式转换依赖 LibreOffice（系统需预装），如未安装将使用备选方案
- 复杂的 Excel 图表建议先测试兼容性
- 批量转换时注意文件命名冲突，脚本会自动添加序号
- 大文件处理可能需要较长时间，建议分批执行
