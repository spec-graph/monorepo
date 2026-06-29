# 设计令牌 (Design Tokens)

> **版本**: v{{ version }}
> **创建日期**: {{ created_date }}
> **最后更新**: {{ last_updated }}
> **设计系统**: {{ design_system_name }}

---

## 1. 颜色系统 (Color System)

### 1.1 品牌色 (Brand Colors)

| Token               | 值        | 用途                    | 对比度 (白色) | 对比度 (黑色) |
| ------------------- | --------- | ----------------------- | ------------- | ------------- |
| `--color-brand-50`  | `#f0f9ff` | 背景、轻量高亮          | —             | 19.1:1 ✅     |
| `--color-brand-100` | `#e0f2fe` | 背景、选中态            | —             | 16.3:1 ✅     |
| `--color-brand-200` | `#bae6fd` | 边框、禁用态            | 1.2:1 ❌      | 12.8:1 ✅     |
| `--color-brand-300` | `#7dd3fc` | 图标、次要按钮          | 2.0:1 ❌      | 7.9:1 ✅      |
| `--color-brand-400` | `#38bdf8` | 次要操作、链接          | 2.9:1 ❌      | 5.4:1 ✅      |
| `--color-brand-500` | `#0ea5e9` | **主按钮、主要操作**    | 3.5:1 ✅ AA   | 4.5:1 ✅ AA   |
| `--color-brand-600` | `#0284c7` | Hover 态、强调          | 4.3:1 ✅ AA   | 3.7:1 ✅ AA   |
| `--color-brand-700` | `#0369a1` | Active 态、深色背景主色 | 5.3:1 ✅ AA   | 3.0:1 ✅ AA   |
| `--color-brand-800` | `#075985` | 深色文字                | 6.5:1 ✅ AAA  | 2.4:1 ❌      |
| `--color-brand-900` | `#0c4a6e` | 深色背景文字            | 8.1:1 ✅ AAA  | 2.0:1 ❌      |

### 1.2 中性色 (Neutral Colors)

| Token              | 值        | 用途                   |
| ------------------ | --------- | ---------------------- |
| `--color-gray-50`  | `#f9fafb` | 页面背景               |
| `--color-gray-100` | `#f3f4f6` | 卡片背景、输入框背景   |
| `--color-gray-200` | `#e5e7eb` | 边框、分割线           |
| `--color-gray-300` | `#d1d5db` | 禁用态边框             |
| `--color-gray-400` | `#9ca3af` | 占位符文字、次要图标   |
| `--color-gray-500` | `#6b7280` | 次要文字、辅助说明     |
| `--color-gray-600` | `#4b5563` | 正文文字               |
| `--color-gray-700` | `#374151` | 标题文字               |
| `--color-gray-800` | `#1f2937` | 强调文字、深色模式正文 |
| `--color-gray-900` | `#111827` | 最重要标题             |

### 1.3 语义色 (Semantic Colors)

| Token                 | 值        | 语义 | 用途                     |
| --------------------- | --------- | ---- | ------------------------ |
| `--color-success-500` | `#10b981` | 成功 | 成功提示、正向操作结果   |
| `--color-warning-500` | `#f59e0b` | 警告 | 需要注意的操作、中等风险 |
| `--color-error-500`   | `#ef4444` | 错误 | 失败提示、破坏性操作     |
| `--color-info-500`    | `#3b82f6` | 信息 | 中性提示、系统通知       |

### 1.4 渐变色 (Gradients)

| Token                | 值                                          | 用途              |
| -------------------- | ------------------------------------------- | ----------------- |
| `--gradient-brand`   | `linear-gradient(135deg, #0ea5e9, #0284c7)` | Hero 区、强调卡片 |
| `--gradient-success` | `linear-gradient(135deg, #10b981, #059669)` | 成功状态插图      |
| `--gradient-sunset`  | `linear-gradient(135deg, #f59e0b, #ef4444)` | 装饰用            |

---

## 2. 间距系统 (Spacing System)

**基础单位**: 4px (0.25rem)

| Token        | 值 (px) | 值 (rem) | 典型用途                 |
| ------------ | ------- | -------- | ------------------------ |
| `--space-0`  | 0       | 0        | 重置                     |
| `--space-1`  | 4       | 0.25     | 紧凑内边距、图标间距     |
| `--space-2`  | 8       | 0.5      | 小卡片内边距、列表项间距 |
| `--space-3`  | 12      | 0.75     | 按钮垂直内边距           |
| `--space-4`  | 16      | 1        | 标准内边距、段落间距     |
| `--space-6`  | 24      | 1.5      | 卡片外边距、区块间距     |
| `--space-8`  | 32      | 2        | 大区块间距               |
| `--space-12` | 48      | 3        | Section 间距             |
| `--space-16` | 64      | 4        | 页面上下边距             |
| `--space-20` | 80      | 5        | Hero 区上下边距          |

**使用规则**:

- ✅ 永远使用 token,不要写死 px/rem 值
- ✅ 优先使用 4 的倍数
- ✅ 水平间距用偶数,垂直间距可灵活调整
- ❌ 不要创造中间值 (如 10px,14px,20px)

---

## 3. 排版系统 (Typography System)

### 3.1 字体栈 (Font Stack)

```css
--font-sans:
  "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
--font-mono: "Fira Code", "JetBrains Mono", Consolas, monospace;
```

### 3.2 字体大小 (Font Sizes)

| Token         | 大小 | 行高 | 字重 | 用途                     |
| ------------- | ---- | ---- | ---- | ------------------------ |
| `--text-xs`   | 12px | 16px | 400  | 辅助说明、标签、脚注     |
| `--text-sm`   | 14px | 20px | 400  | 正文、按钮文字、表单标签 |
| `--text-base` | 16px | 24px | 400  | 默认正文、段落           |
| `--text-lg`   | 18px | 28px | 500  | 小标题、重要正文         |
| `--text-xl`   | 20px | 28px | 600  | 卡片标题                 |
| `--text-2xl`  | 24px | 32px | 600  | 页面内标题               |
| `--text-3xl`  | 30px | 36px | 700  | 页面大标题               |
| `--text-4xl`  | 36px | 40px | 700  | Hero 标题                |
| `--text-5xl`  | 48px | 1    | 800  | 营销页面超大标题         |

### 3.3 字重 (Font Weights)

| Token             | 值  | 用途           |
| ----------------- | --- | -------------- |
| `--font-normal`   | 400 | 正文、普通文字 |
| `--font-medium`   | 500 | 强调、按钮文字 |
| `--font-semibold` | 600 | 小标题         |
| `--font-bold`     | 700 | 大标题、CTA    |

### 3.4 行高 (Line Heights)

| Token               | 值   | 用途           |
| ------------------- | ---- | -------------- |
| `--leading-tight`   | 1.25 | 大标题、短文本 |
| `--leading-normal`  | 1.5  | 正文、段落     |
| `--leading-relaxed` | 1.75 | 长文、博客内容 |

---

## 4. 圆角 (Border Radius)

| Token           | 值     | 用途                 |
| --------------- | ------ | -------------------- |
| `--radius-none` | 0px    | 直角按钮、输入框     |
| `--radius-sm`   | 2px    | 小标签、徽章         |
| `--radius-md`   | 6px    | 按钮、输入框、卡片   |
| `--radius-lg`   | 8px    | 模态框、大卡片       |
| `--radius-xl`   | 12px   | Hero 卡片、营销组件  |
| `--radius-full` | 9999px | 圆形按钮、头像、标签 |

---

## 5. 阴影 (Shadows)

| Token         | 值                                  | 用途               |
| ------------- | ----------------------------------- | ------------------ |
| `--shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)`     | 输入框、小卡片     |
| `--shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1)`   | 按钮悬浮、卡片悬浮 |
| `--shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1)` | 模态框、下拉菜单   |
| `--shadow-xl` | `0 20px 25px -5px rgb(0 0 0 / 0.1)` | 弹出层、强调卡片   |

**交互状态变化**:

- Default: `--shadow-sm`
- Hover: `--shadow-md` + 上移 2px
- Active: `--shadow-sm` (回到默认)

---

## 6. 动画与过渡 (Animations & Transitions)

### 6.1 过渡时长

| Token               | 值    | 用途                 |
| ------------------- | ----- | -------------------- |
| `--duration-fast`   | 150ms | 微交互、颜色变化     |
| `--duration-normal` | 300ms | 标准过渡、按钮悬浮   |
| `--duration-slow`   | 500ms | 模态框动画、页面切换 |

### 6.2 缓动函数

| Token            | 值                             | 用途     |
| ---------------- | ------------------------------ | -------- |
| `--ease-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | 标准过渡 |
| `--ease-out`     | `cubic-bezier(0, 0, 0.2, 1)`   | 元素进入 |
| `--ease-in`      | `cubic-bezier(0.4, 0, 1, 1)`   | 元素离开 |

### 6.3 预设动画

```css
/* 淡入 */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 滑入 (从下往上) */
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 缩放进入 */
@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

---

## 7. 断点 (Breakpoints)

| Token              | 值     | 设备类型        |
| ------------------ | ------ | --------------- |
| `--breakpoint-sm`  | 640px  | 手机横屏        |
| `--breakpoint-md`  | 768px  | 平板竖屏        |
| `--breakpoint-lg`  | 1024px | 平板横屏/小桌面 |
| `--breakpoint-xl`  | 1280px | 标准桌面        |
| `--breakpoint-2xl` | 1536px | 大桌面/4K       |

---

## 8. Z-Index 层级

**原则**: 分层清晰,避免"z-index 军备竞赛",最大不超过 100

| Token          | 值  | 层级说明           |
| -------------- | --- | ------------------ |
| `--z-dropdown` | 50  | 下拉菜单、选择器   |
| `--z-sticky`   | 100 | 粘性导航、固定表头 |
| `--z-modal`    | 200 | 模态框、对话框     |
| `--z-toast`    | 300 | Toast 通知、提示条 |
| `--z-tooltip`  | 400 | 工具提示(最上层)   |

---

## 9. 组件令牌 (Component Tokens)

### 9.1 按钮 (Button)

| Token                  | 值   |
| ---------------------- | ---- |
| `--button-height-sm`   | 32px |
| `--button-height-md`   | 40px |
| `--button-height-lg`   | 48px |
| `--button-padding-x`   | 16px |
| `--button-radius`      | 6px  |
| `--button-font-weight` | 500  |

### 9.2 输入框 (Input)

| Token                  | 值                                  |
| ---------------------- | ----------------------------------- |
| `--input-height`       | 40px                                |
| `--input-padding-x`    | 12px                                |
| `--input-border-color` | `--color-gray-300`                  |
| `--input-focus-ring`   | `0 0 0 3px rgba(14, 165, 233, 0.2)` |

---

## 10. 暗色模式 (Dark Mode)

### 10.1 暗色映射规则

| 亮面色阶            | 暗面色阶 | 说明       |
| ------------------- | -------- | ---------- |
| gray-50 (页面背景)  | gray-900 |            |
| gray-100 (卡片背景) | gray-800 |            |
| gray-200 (边框)     | gray-700 |            |
| gray-600 (正文)     | gray-300 | 反转变亮   |
| gray-900 (标题)     | gray-100 | 反转变最亮 |

### 10.2 暗色专用令牌

```css
--dark-bg-page: var(--color-gray-900);
--dark-bg-card: var(--color-gray-800);
--dark-border: var(--color-gray-700);
--dark-text-primary: var(--color-gray-100);
--dark-text-secondary: var(--color-gray-400);
```

---

## 11. 使用规范与检查清单

### 11.1 颜色使用检查

- [ ] 文本与背景对比度 ≥ 4.5:1 (AA 级)
- [ ] 颜色不是传达信息的唯一手段 (配合图标/文字)
- [ ] 品牌色 500/600 用于主要操作,400 用于次要
- [ ] 灰色阶只用 token,不出现"差不多"的灰色

### 11.2 排版使用检查

- [ ] 正文字号 ≥ 14px
- [ ] 行高 ≥ 1.5 对于长文本
- [ ] 同层级文字大小/字重一致,不出现"差不多大"
- [ ] 标题层级清晰 (H1/H2/H3 大小差异明显)

### 11.3 间距使用检查

- [ ] 只用提供的 spacing token,不写死像素
- [ ] 垂直韵律一致: 段落间距、区块间距有规律
- [ ] 水平和垂直间距使用相同的 4px 倍数系统
- [ ] 同级元素间距相同,不出现"这个卡片比那个宽 2px"

---

## 12. 变更记录

| 版本 | 日期         | 变更内容              | 变更人         |
| ---- | ------------ | --------------------- | -------------- |
| v1.0 | {{ date_1 }} | 初始版本,定义基础令牌 | {{ author_1 }} |
| v1.1 | {{ date_2 }} | 新增暗色模式令牌      | {{ author_2 }} |

---

## 模板使用说明

> **什么是 Design Token?**
> 设计令牌是设计系统的"原子变量",用统一的命名替代硬编码值。
> 好处:
>
> 1. **一致性**: 整个产品不会出现 50 种"差不多的蓝色"
> 2. **可维护性**: 改一个地方,全局生效
> 3. **跨平台**: 设计和开发共用同一套命名,沟通成本为 0
> 4. **暗色模式**: 一键切换,映射清晰
>
> **命名原则**: `类型 - 名称 - 变体 - 状态`
> 例: `--color-brand-500-hover`
> 例: `--button-primary-background`
>
> **工具链提示**:
>
> - 用 Figma Tokens 插件同步设计和开发
> - 用 Style Dictionary 导出多平台格式 (CSS/SCSS/JS/iOS/Android)
> - CI 检查代码中是否出现硬编码的颜色/字号
