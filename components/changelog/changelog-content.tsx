"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface ChangelogContentProps {
  body: unknown;
  className?: string;
}

/**
 * Read-only renderer for a Tiptap JSON document. Uses the same extensions as
 * the editor so output matches input.
 */
export function ChangelogContent({ body, className }: ChangelogContentProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: true, autolink: true }),
    ],
    content: (body as object) ?? { type: "doc", content: [] },
    editable: false,
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor && body) {
      editor.commands.setContent((body as object) ?? { type: "doc", content: [] });
    }
  }, [body, editor]);

  return (
    <EditorContent
      editor={editor}
      className={cn("changelog-prose", className)}
    />
  );
}
