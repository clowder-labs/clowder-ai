# Excel 格式配置规范

## 目录
- [字体配置](#字体配置)
- [边框配置](#边框配置)
- [填充配置](#填充配置)
- [对齐配置](#对齐配置)
- [条件格式配置](#条件格式配置)
- [完整示例](#完整示例)

## 概览
本文档定义了 Excel 报表自动化处理中格式化参数的完整结构、验证规则和使用示例。

---

## 字体配置

### 数据结构
```json
{
  "font": {
    "<单元格范围>": {
      "name": "<字体名称>",
      "size": <字号>,
      "bold": <是否加粗>,
      "italic": <是否斜体>,
      "color": "<颜色代码>"
    }
  }
}
```

### 参数说明
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| name | string | 否 | "Arial" | 字体名称（如 "Arial", "宋体", "微软雅黑"） |
| size | integer | 否 | 11 | 字号大小 |
| bold | boolean | 否 | false | 是否加粗 |
| italic | boolean | 否 | false | 是否斜体 |
| color | string | 否 | "000000" | 颜色代码（十六进制，不含#） |

### 示例
```json
{
  "font": {
    "A1:D1": {
      "name": "微软雅黑",
      "size": 14,
      "bold": true,
      "color": "FFFFFF"
    },
    "A2:A10": {
      "name": "Arial",
      "size": 11,
      "bold": false
    }
  }
}
```

---

## 边框配置

### 数据结构
```json
{
  "border": {
    "<单元格范围>": {
      "left": "<边框样式>",
      "right": "<边框样式>",
      "top": "<边框样式>",
      "bottom": "<边框样式>"
    }
  }
}
```

### 边框样式选项
| 样式值 | 说明 |
|--------|------|
| thin | 细线 |
| medium | 中等粗线 |
| thick | 粗线 |
| double | 双线 |
| dashed | 虚线 |
| dotted | 点线 |
| none | 无边框 |

### 示例
```json
{
  "border": {
    "A1:D10": {
      "left": "thin",
      "right": "thin",
      "top": "medium",
      "bottom": "medium"
    }
  }
}
```

---

## 填充配置

### 数据结构
```json
{
  "fill": {
    "<单元格范围>": {
      "color": "<颜色代码>"
    }
  }
}
```

### 示例
```json
{
  "fill": {
    "A1:D1": {
      "color": "4472C4"
    },
    "A2:D10": {
      "color": "D9E2F3"
    }
  }
}
```

---

## 对齐配置

### 数据结构
```json
{
  "alignment": {
    "<单元格范围>": {
      "horizontal": "<水平对齐>",
      "vertical": "<垂直对齐>",
      "wrap_text": <是否自动换行>
    }
  }
}
```

### 对齐选项
**水平对齐**：
- left: 左对齐
- center: 居中
- right: 右对齐

**垂直对齐**：
- top: 顶部对齐
- center: 居中
- bottom: 底部对齐

### 示例
```json
{
  "alignment": {
    "A1:D1": {
      "horizontal": "center",
      "vertical": "center"
    },
    "A2:D10": {
      "horizontal": "left",
      "vertical": "center",
      "wrap_text": true
    }
  }
}
```

---

## 条件格式配置

### 数据条格式
```json
{
  "conditional_format": {
    "<单元格范围>": {
      "type": "data_bar",
      "start_type": "<起始类型>",
      "end_type": "<结束类型>",
      "color": "<颜色代码>"
    }
  }
}
```

### 色阶格式
```json
{
  "conditional_format": {
    "<单元格范围>": {
      "type": "color_scale",
      "start_type": "<起始类型>",
      "start_color": "<起始颜色>",
      "mid_type": "<中间类型>",
      "mid_color": "<中间颜色>",
      "end_type": "<结束类型>",
      "end_color": "<结束颜色>"
    }
  }
}
```

### 类型选项
- min: 最小值
- max: 最大值
- percentile: 百分位数
- num: 具体数值

### 示例
```json
{
  "conditional_format": {
    "B2:B10": {
      "type": "data_bar",
      "start_type": "min",
      "end_type": "max",
      "color": "638EC6"
    },
    "C2:C10": {
      "type": "color_scale",
      "start_type": "min",
      "start_color": "F8696B",
      "mid_type": "percentile",
      "mid_color": "FFEB84",
      "end_type": "max",
      "end_color": "63BE7B"
    }
  }
}
```

---

## 完整示例

### 标题行格式化
```json
{
  "font": {
    "A1:E1": {
      "name": "微软雅黑",
      "size": 12,
      "bold": true,
      "color": "FFFFFF"
    }
  },
  "fill": {
    "A1:E1": {
      "color": "4472C4"
    }
  },
  "alignment": {
    "A1:E1": {
      "horizontal": "center",
      "vertical": "center"
    }
  },
  "border": {
    "A1:E20": {
      "left": "thin",
      "right": "thin",
      "top": "thin",
      "bottom": "thin"
    }
  }
}
```

### 数据区域格式化
```json
{
  "font": {
    "A2:E20": {
      "name": "Arial",
      "size": 10
    }
  },
  "alignment": {
    "A2:A20": {
      "horizontal": "left"
    },
    "B2:E20": {
      "horizontal": "right"
    }
  },
  "conditional_format": {
    "D2:D20": {
      "type": "data_bar",
      "color": "63BE7B"
    }
  }
}
```

---

## 验证规则

1. **单元格范围格式**：必须符合 Excel 范围表示法（如 "A1:B10"）
2. **颜色代码**：必须为 6 位十六进制字符串（不含#）
3. **边框样式**：必须为预定义样式值之一
4. **对齐方式**：必须为预定义选项之一
5. **字号大小**：必须在 1-72 之间

## 常见颜色代码参考

| 颜色名称 | 代码 | 示例 |
|---------|------|------|
| 红色 | FF0000 | 红色文本 |
| 绿色 | 00FF00 | 绿色文本 |
| 蓝色 | 0000FF | 蓝色文本 |
| 白色 | FFFFFF | 白色文本 |
| 黑色 | 000000 | 黑色文本 |
| 深蓝 | 4472C4 | 专业蓝 |
| 浅蓝 | D9E2F3 | 背景蓝 |
