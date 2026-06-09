"use client";

import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  SquareCode,
  Minus,
  Undo2,
  Redo2,
} from "lucide-react";
import { cn } from "@/lib/util";

interface Props {
  editor: Editor | null;
}

type Level = 1 | 2 | 3;

interface ToolbarButtonDef {
  label: string;
  icon: React.ElementType;
  action: (editor: Editor) => void;
  isActive: (editor: Editor) => boolean;
}

const buttons: ToolbarButtonDef[] = [
  {
    label: "加粗",
    icon: Bold,
    action: (e) => e.chain().focus().toggleBold().run(),
    isActive: (e) => e.isActive("bold"),
  },
  {
    label: "斜体",
    icon: Italic,
    action: (e) => e.chain().focus().toggleItalic().run(),
    isActive: (e) => e.isActive("italic"),
  },
  {
    label: "删除线",
    icon: Strikethrough,
    action: (e) => e.chain().focus().toggleStrike().run(),
    isActive: (e) => e.isActive("strike"),
  },
  {
    label: "行内代码",
    icon: Code,
    action: (e) => e.chain().focus().toggleCode().run(),
    isActive: (e) => e.isActive("code"),
  },
  {
    label: "分隔线",
    icon: Minus,
    action: (e) => e.chain().focus().setHorizontalRule().run(),
    isActive: () => false,
  },
];

const headingButtons: ToolbarButtonDef[] = [
  {
    label: "标题 1",
    icon: Heading1,
    action: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    isActive: (e) => e.isActive("heading", { level: 1 }),
  },
  {
    label: "标题 2",
    icon: Heading2,
    action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    isActive: (e) => e.isActive("heading", { level: 2 }),
  },
  {
    label: "标题 3",
    icon: Heading3,
    action: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    isActive: (e) => e.isActive("heading", { level: 3 }),
  },
];

const listButtons: ToolbarButtonDef[] = [
  {
    label: "无序列表",
    icon: List,
    action: (e) => e.chain().focus().toggleBulletList().run(),
    isActive: (e) => e.isActive("bulletList"),
  },
  {
    label: "有序列表",
    icon: ListOrdered,
    action: (e) => e.chain().focus().toggleOrderedList().run(),
    isActive: (e) => e.isActive("orderedList"),
  },
  {
    label: "引用",
    icon: Quote,
    action: (e) => e.chain().focus().toggleBlockquote().run(),
    isActive: (e) => e.isActive("blockquote"),
  },
  {
    label: "代码块",
    icon: SquareCode,
    action: (e) => e.chain().focus().toggleCodeBlock().run(),
    isActive: (e) => e.isActive("codeBlock"),
  },
];

function ToolbarBtn({ btn, editor }: { btn: ToolbarButtonDef; editor: Editor }) {
  const Icon = btn.icon;
  const active = btn.isActive(editor);
  return (
    <button
      type="button"
      title={btn.label}
      onClick={() => btn.action(editor)}
      className={cn(
        "p-1.5 rounded hover:bg-gray-100 transition-colors",
        active ? "bg-gray-200 text-blue-600" : "text-gray-600"
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5 shrink-0" />;
}

export function EditorToolbar({ editor }: Props) {
  if (!editor) return null;

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b bg-white sticky top-0 z-10 flex-wrap">
      {/* Undo / Redo */}
      <button
        type="button"
        title="撤销"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="重做"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Redo2 className="h-4 w-4" />
      </button>

      <ToolbarDivider />

      {/* Inline formatting */}
      {buttons.map((btn) => (
        <ToolbarBtn key={btn.label} btn={btn} editor={editor} />
      ))}

      <ToolbarDivider />

      {/* Headings */}
      {headingButtons.map((btn) => (
        <ToolbarBtn key={btn.label} btn={btn} editor={editor} />
      ))}

      <ToolbarDivider />

      {/* Lists / Quote / Code block */}
      {listButtons.map((btn) => (
        <ToolbarBtn key={btn.label} btn={btn} editor={editor} />
      ))}

      <span className="ml-auto text-[10px] text-gray-400 hidden sm:inline">
        Markdown 快捷输入: #标题, **加粗**, *斜体*
      </span>
    </div>
  );
}
