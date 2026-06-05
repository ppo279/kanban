"use client";

import { Extension } from "@tiptap/core";
import { yCursorPlugin } from "@tiptap/y-tiptap";
import type { Awareness } from "y-protocols/awareness";

export interface CustomCursorOptions {
  awareness: Awareness;
  user: {
    name: string;
    color: string;
  };
}

/**
 * Custom cursor plugin that uses yCursorPlugin from @tiptap/y-tiptap
 * instead of y-prosemirror's version, ensuring the ySyncPluginKey
 * matches between the sync and cursor plugins.
 */
export const CustomCursorPlugin = Extension.create<CustomCursorOptions>({
  name: "customCursor",

  addProseMirrorPlugins() {
    return [
      yCursorPlugin(
        this.options.awareness,
        {
          cursorBuilder: (user) => {
            const cursor = document.createElement("span");
            cursor.classList.add("ProseMirror-yjs-cursor");
            cursor.setAttribute("style", `border-color: ${user.color}`);
            const userDiv = document.createElement("div");
            userDiv.setAttribute("style", `background-color: ${user.color}`);
            userDiv.textContent = user.name || "";
            cursor.appendChild(document.createTextNode("\u2060"));
            cursor.appendChild(userDiv);
            cursor.appendChild(document.createTextNode("\u2060"));
            return cursor;
          },
          selectionBuilder: (user) => ({
            style: `background-color: ${user.color}70`,
            class: "ProseMirror-yjs-selection",
          }),
        },
        "cursor",
      ),
    ];
  },
});
