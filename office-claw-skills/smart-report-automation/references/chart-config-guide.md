# 图表配置指南

## 目录
- [图表类型](#图表类型)
- [基本配置](#基本配置)
- [数据范围设置](#数据范围设置)
- [样式设置](#样式设置)
- [完整示例](#完整示例)

## 概览
本文档定义了 Excel 报表自动化处理中图表参数的配置选项、验证规则和使用示例。

---

## 图表类型

| 类型值 | 说明 | 适用场景 |
|--------|------|----------|
| bar | 柱状图 | 分类数据对比 |
| line | 折线图 | 趋势分析、时间序列 |
| pie | 饼图 | 占比分析 |
| scatter | 散点图 | 相关性分析 |
| area | 面积图 | 累积趋势 |

---

## 基本配置

### 数据结构
```json
[
  {
    "type": "<图表类型>",
    "title": "<图表标题>",
    "data_range": "<数据范围>",
    "categories_range": "<分类范围>",
    "position": "<图表位置>",
    "sheet": "<工作表名称>"
  }
]
```

### 参数说明
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| type | string | 是 | - | 图表类型（bar/line/pie/scatter/area） |
| title | string | 否 | "" | 图表标题 |
| data_range | string | 是 | - | 数据区域（如 "B1:B10"） |
| categories_range | string | 否 | - | 分类标签区域（如 "A1:A10"） |
| position | string | 否 | "E5" | 图表在工作表中的位置 |
| sheet | string | 否 | 当前工作表 | 工作表名称 |
| style | integer | 否 | 10 | 图表样式编号（1-48） |
| show_legend | boolean | 否 | true | 是否显示图例 |
| legend_position | string | 否 | "r" | 图例位置（r/l/t/b） |
| show_labels | boolean | 否 | false | 是否显示数据标签 |

---

## 数据范围设置

### 单系列数据
```json
{
  "type": "bar",
  "data_range": "B1:B10",
  "categories_range": "A1:A10"
}
```

### 多系列数据
```json
{
  "type": "line",
  "data_range": "B1:D10",
  "categories_range": "A1:A10"
}
```

**说明**：
- `data_range` 的第一行通常为系列名称
- `categories_range` 定义 X 轴标签

---

## 样式设置

### 图表样式
样式编号范围：1-48，影响图表的配色和边框样式。

| 样式范围 | 特点 |
|---------|------|
| 1-12 | 简约风格 |
| 13-24 | 深色主题 |
| 25-36 | 彩色主题 |
| 37-48 | 专业风格 |

### 图例位置
| 值 | 位置 |
|----|------|
| r | 右侧 |
| l | 左侧 |
| t | 顶部 |
| b | 底部 |

---

## 完整示例

### 示例 1：柱状图 - 销售数据对比
```json
[
  {
    "type": "bar",
    "title": "2024年各月销售额",
    "data_range": "B2:B13",
    "categories_range": "A2:A13",
    "position": "E5",
    "style": 10,
    "show_legend": true,
    "legend_position": "r",
    "show_labels": true
  }
]
```

**数据布局**：
```
A列（月份）  B列（销售额）
1月         50000
2月         55000
3月         48000
...
```

### 示例 2：折线图 - 日活趋势
```json
[
  {
    "type": "line",
    "title": "日活用户趋势",
    "data_range": "B1:B31",
    "categories_range": "A1:A31",
    "position": "E5",
    "style": 13,
    "show_legend": true
  }
]
```

**数据布局**：
```
A列（日期）  B列（日活）
1日         1200
2日         1350
3日         1280
...
```

### 示例 3：饼图 - 市场份额
```json
[
  {
    "type": "pie",
    "title": "产品市场份额",
    "data_range": "B2:B6",
    "categories_range": "A2:A6",
    "position": "E5",
    "style": 26,
    "show_legend": true,
    "legend_position": "r",
    "show_labels": true
  }
]
```

**数据布局**：
```
A列（产品）  B列（份额）
产品A       35
产品B       28
产品C       22
产品D       10
产品E       5
```

### 示例 4：多系列折线图
```json
[
  {
    "type": "line",
    "title": "收入与成本对比",
    "data_range": "B1:C13",
    "categories_range": "A1:A13",
    "position": "E5",
    "style": 10,
    "show_legend": true,
    "legend_position": "b"
  }
]
```

**数据布局**：
```
A列（月份）  B列（收入）  C列（成本）
           收入         成本
1月        50000        30000
2月        55000        32000
3月        48000        28000
...
```

---

## 验证规则

1. **图表类型**：必须为 bar/line/pie/scatter/area 之一
2. **数据范围**：必须为有效的 Excel 范围表示法
3. **图表位置**：必须为有效的单元格引用（如 "E5"）
4. **样式编号**：必须在 1-48 之间
5. **图例位置**：必须为 r/l/t/b 之一

---

## 最佳实践

1. **柱状图**：适用于分类数据对比，建议不超过 10 个分类
2. **折线图**：适用于趋势分析，数据点建议 5-50 个
3. **饼图**：适用于占比分析，建议 3-7 个分类
4. **多系列**：建议不超过 5 个系列，避免图表过于复杂
5. **图表位置**：预留足够空间，建议至少 10 列 x 15 行的区域
