# Reasonix project memory

Notes the user pinned via the `#` prompt prefix. The whole file is
loaded into the immutable system prefix every session — keep it terse.

- 协作编辑器 markdown 输入行为 — 交接文档

> **作者**: Mavis
> **日期**: 2026-06-09
> **面向**: 接手修复 markdown 行为的下一位工程师(包括我自己)
> **相关 commit**: `215994f`, `1178b4f`, 以及未提交的最后改动

---

## 1. 用户问题(原话)

> "我要 fix 功能, 现在点击文档, 点击写作文档, 弹出层里是富文本编辑器, 怎么不支持 markdown 语法?"

具体场景(用户实际输入):
```
#1
[空行]
** 2
```
用户期望: `#1` 按回车 → 变 h1;`** 2` 按回车 → 变粗体。

第二次反馈: "还是不行, 输入 #加空格, 直接就变了"。
用户期望: **完全按回车才生效**(`# ` 输空格时不能立刻变)。

---

## 2. 上下文

- **文件**: `src/components/docs/CollaborativeEditor.tsx`
- **编辑器**: Tiptap v3, 通过 `@tiptap/extension-collaboration` 接入 Y.js 实时协作
- **依赖栈**: `@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/extension-collaboration`, `@tiptap/y-tiptap`
- **已有功能**: 编辑器+协作工作,文档列表、CRUD、Y.js sync 全跑通
- **关键约束**: 任何修改必须**跟 Y.js 协作兼容**(不能破坏 collaborative editing)

---

## 3. 已经尝试过的方案(两轮 fix,都没彻底解决问题)

### 3.1 第一轮(commit `215994f`): 自定义 input rules 扩展

**思路**: StarterKit 自带的行内 mark input rules 在 collab 模式下静默失效(队友 qihailong 的 commit `7508743` 写明),他只对块级做了 workaround。我补上**行内 mark input rules**(`**bold**` `*italic*` `~~strike~~` `` `code` `` `[link](url)`)。

**实现**:
- `MarkdownInput` extension: 块级 input rules(heading/list/quote/codeblock/hr),用 `InputRule` + 自定义 handler
- `InlineMarkdown` extension: 行内 input rules,用 `@tiptap/core` 的 `markInputRule` API
- 两者都放在 `Collaboration` 之前注册

**问题**:
1. **`#1` 不触发** — input rule 是 `^#{1,N}\s$`,要求 `#` 后必须有空白字符。`#1` 字符不空白,不变
2. **`** 2` 不触发** — 我**故意**加了 `(?!\s)` 否定前瞻,要求 `**` 后紧跟非空白字符。` ** 2` 是空白开头,不变
3. **设计取舍跟用户预期冲突** — 用户的 `# 1` 也得"输空格才触发",对用户来说同样不直观

### 3.2 第二轮(commit `1178b4f`): 改成按 Enter 触发

**思路**: 用户的心智模型是"先随便写,写完按回车让它变 markdown",跟 Typora/Obsidian 一致。重写为 `MarkdownOnEnter` extension,`addKeyboardShortcuts` 拦截 Enter keydown。

**实现**:
- `MarkdownOnEnter` extension,`addKeyboardShortcuts` 返回 `{ Enter: handler }`
- 拦截 Enter 后: 取 `$from.parent` 当前 textblock,拿 textContent 并 trim,匹配 markdown 模式
- 匹配上: `tr.setBlockType + tr.replaceWith` 改 block type + 删 markdown 符号 + 加 mark
- 匹配不上: return false,让默认 enter 走(新开一段)
- 删了之前的 `MarkdownInput` + `InlineMarkdown` 两个 extension

**问题**:
1. **StarterKit 自带的 input rules 没禁用** — Tiptap StarterKit 包含 `Heading`/`Bold`/`Italic`/`Code`/`Strike`/`Link` 等 mark,这些 mark 自己在 `addInputRules()` 里 hardcode 了 input regex(我看过 Bold 源码,`starInputRegex = /(?:^|\s)(\*\*(?!\s+\*\*)((?:[^*]+))\*\*(?!\s+\*\*))$/`)
2. **用户输 `#加空格, 直接就变了** — 这其实是 StarterKit 自带 Heading 的 input rule 还在跑,不是我新代码的行为
3. **StarterKit 自带 input rules 跟 Y.js 协作有兼容问题** — 但块级 heading 的 input rule 似乎部分工作了(用户实际看到了"#加空格立刻变")

---

## 4. 当前未解决的问题(留给下一位)

### 4.1 核心问题

需要**完全禁用 StarterKit 自带的所有 input rules + paste rules**,只保留 Enter 触发的转换行为。具体要禁的:

| StarterKit mark | 自带 input rule 触发模式 | 怎么禁 |
|---|---|---|
| `Heading` | `# `, `## ` ... `###### ` | 改 StarterKit 配置: `heading: Heading.extend({ addInputRules: () => [] })` |
| `Bold` | `**...**`, `__...__` | 同上, `bold: Bold.extend({ addInputRules: () => [] })` |
| `Italic` | `*...*`, `_..._` | 同上 |
| `Strike` | `~~...~~` | 同上 |
| `Code` | `` `...` `` | 同上 |
| `CodeBlock` | ` ``` ` | 同上 |
| `Blockquote` | `> ` | 同上 |
| `BulletList` | `- `, `* ` | 同上 |
| `OrderedList` | `1. ` | 同上 |
| `HorizontalRule` | `---`, `***` | 同上 |
| `Link` | 自动 linkify URL | 同上 |

**API 形式**:
```ts
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, ... } from "@tiptap/starter-kit";  // 实际不一定能这样 import
// 或更稳妥: 不用 StarterKit,手动装 extensions

StarterKit.configure({
  bold: false,  // 牺牲 mark 本身换 input rule 关闭 — 太重
  // 或: heading: Heading.configure({...}).extend({ addInputRules: () => [] })
  // 注意: v3 API 的 options 不暴露 closeInputRules 开关
})
```

**最干净的修法**:
1. 不用 StarterKit,手动从 `@tiptap/extension-bold` / `@tiptap/extension-italic` 等单独装,这样能 `.extend({ addInputRules: () => [] })` 拿掉 input rules
2. 或者用 `Extension` 重新声明每个 mark(工作量大,block 1 行 input rule 在 starter-kit 里的)

### 4.2 我的实现里还有几个潜在 bug

`MarkdownOnEnter` 里我用了 `tr.setBlockType` + `tr.replaceWith`,**位置计算依赖于"段落 node 的 from 是 node 起点,to 是 from + nodeSize"** — 这在 `paragraph` 直接是 doc 顶层时对,但**如果段落被包在 listItem/bulletList 里,from 不是段落起点**。我代码里假设的 `from = block.pos` 是从 `$from.before(d)` 拿的,这是 textblock 的实际起点,理论上对。但**没测过 list 嵌套里的情形**(用户在 listItem 里按回车,listItem 内容是 `# item` 会变啥)。

### 4.3 Y.js 同步风险

我用的是 `state.apply(tr)`,**没用 `editor.commands` 系列**。理论上 Tiptap 的 `commands` 会自动处理 Y.js 同步标记,但裸 `tr.apply` 可能丢失某些 meta。需要**真在浏览器里打开两个窗口协作测一下**:
- 窗口 A 输 `# title` + 回车
- 窗口 B 是否立刻看到 h1 标题?
- 是不是有内容不同步、cursor 跳位置、Y.Doc corruption 等问题?

### 4.4 行内 markdown 检测太简单

`detectInlineMarkdown` 只处理"**整段内容都是 markdown 标记**"的简单情况(`**hi**` 整段,转 bold)。**段落内混合 markdown 不支持**:

| 输入 | 期望 | 实际 |
|---|---|---|
| `**hi**` | bold "hi" | ✅ 正确转 |
| `hello **world** foo` | bold "world",其他普通 | ❌ 不识别,默认 enter 开新段 |
| `**hi** and **bye**` | 两个 bold 段 | ❌ 不识别 |

要支持段落内混合,得**写个 markdown tokenizer** 解析段落内的多个 token。比 Enter 触发的整段解析复杂一个量级。

---

## 5. 关键文件位置

| 文件 | 作用 |
|---|---|
| `src/components/docs/CollaborativeEditor.tsx` | 编辑器主组件,包含 `MarkdownOnEnter` extension(行 106-236) |
| `src/components/docs/EditorToolbar.tsx` | 工具栏(已有 B/I/Strike/Code 等按钮,跟 markdown 转换无关) |
| `src/components/docs/DocPanel.tsx` | 文档列表 + dialog 容器(管理 dialog 打开/关闭) |
| `src/components/docs/DocSidebar.tsx` | 侧边栏(API 文档 / 协作文档 tab 切换) |
| `node_modules/@tiptap/extension-bold/src/bold.tsx` | Bold 源码,看 input rules 怎么 hardcode 的 |
| `node_modules/@tiptap/starter-kit/src/starter-kit.ts` | StarterKit 配置,看能传哪些 options |

---

## 6. 验证方式

### 6.1 用户手动验证(最直接)
- dev server 跑在 `http://localhost:3000`
- 登录(默认密码 `kanban123`),进"文档" → "协作文档" → "新建"一个文档
- 在编辑器里输各种 markdown 模式,按回车看是否转换

### 6.2 单元测试(我写了一半,没完成)
Tiptap 可以脱离 DOM 测 extension logic:
```ts
import { Editor } from "@tiptap/core";
// 构造一个只有 MarkdownOnEnter extension 的 editor
// 输入文本,模拟 Enter 事件,断言 doc 变化
```

但写完测试 + 调试 11 类语法,工作量大约 1-2 小时。

### 6.3 浏览器协作测试(必须)
打开**两个浏览器窗口**(一个 Chrome,一个 Edge,或者一个普通窗口一个隐身窗口),都登录,都打开同一个文档。一个窗口输 `# title` + 回车,另一个窗口应该同步看到 h1。

---

## 7. 给下一位的建议(按优先级)

### 优先级 1(必做): 禁用 StarterKit 自带 input rules
否则用户怎么按回车都看到的是 StarterKit 的 input rule 在跑,跟我新加的 Enter 触发**行为不一致**,体验混乱。

### 优先级 2: 真机测试 Enter 触发的 11 类语法
- 至少测: heading 1-6, bold, italic, strike, code, codeblock, blockquote, bullet list, ordered list, horizontal rule, link
- 验证 tr.setBlockType + tr.replaceWith 在各种情形下不出错

### 优先级 3: 协作测试(双窗口)
验证 Y.js 同步没被破坏。

### 优先级 4(可选): 行内混合 markdown 支持
如果产品有"段落内 bold 普通文字"需求,加个段落级 markdown tokenizer。

### 优先级 5(可选): 写 vitest 单元测试
把 MarkdownOnEnter 的 11 类规则锁住,避免后续改动 regression。

---

## 8. Git 状态

- 当前 main 领先 origin/main 2 commits:
  - `215994f` fix(docs): 行内 markdown 快捷输入 (InputRule 方案,被推翻)
  - `1178b4f` refactor(docs): markdown 转换改为按 Enter 触发 (当前代码)
- `1178b4f` 没彻底解决问题(因为没禁用 StarterKit 自带 input rules)
- **建议**: 先不要 push,等完成"优先级 1"(禁用 StarterKit input rules)再一次性 push

---

## 9. 调试技巧(自己踩过的坑)

1. **不要混跑 `pnpm build` 和 dev** — build 会写 `.next` 目录,污染 dev 期望的 chunks,导致 dev server 500。改完代码直接 dev 验,需要 build 时先 `mavis-trash .next`
2. **HMR 不一定 reload extension 改动** — 改 `addInputRules` 改成 `addKeyboardShortcuts`,React Fast Refresh 只能热替换组件,editor 实例可能被冻结。**让用户浏览器硬刷新**(`Ctrl+Shift+R` / `Ctrl+F5`)兜底
3. **Playwright 的 stdin JSON 传中文会变成 `?`** — 中文文本通过 `mavis mcp call playwright ... --stdin` 会被编码破坏。规避:用 `Get-Content ... | mavis mcp call ... --stdin` 从文件读,文件用 `Write` 工具写(UTF-8);或者改用 `page.keyboard.type()` 模拟输入
4. **`$from.parent` 在 list 嵌套里可能不是 paragraph** — 找到最里层 textblock 的代码: `for (let d = $from.depth; d >= 0; d--) { const node = $from.node(d); if (node.isTextblock) return { node, pos: $from.before(d) }; }`, 我代码里 `getConvertibleBlock` 就是这么写的,但只对 paragraph/heading 测过

---

## 10. 关键引用

- Tiptap v3 docs: https://tiptap.dev/docs/editor/getting-started/install/vite
- Tiptap `addKeyboardShortcuts` API: https://tiptap.dev/docs/editor/api/extension#addkeyboardshortcuts
- Tiptap `tr.setBlockType` / `tr.replaceWith` (prosemirror): https://prosemirror.net/docs/ref/#state.Transaction
- Y.js Tiptap 协作: https://tiptap.dev/docs/editor/extensions/collaboration

---

**TL;DR**: 用户的核心需求是"按回车才生效",我做了 Enter 触发 extension (`1178b4f`)。但 **StarterKit 自带的输入规则没被禁用**,所以用户实际看到的是 StarterKit 自己的行为(输 `# ` 立刻变)。下一位需要**禁用 StarterKit 自带的所有 input rules**,否则行为会一直混乱。
