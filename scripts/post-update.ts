/**
 * Post a changelog entry from a markdown file.
 *
 * Usage:
 *   npm run post-update                              # post all .md files in supabase/changelog-pending/
 *   npm run post-update -- path/to/entry.md          # post a specific file
 *
 * Frontmatter:
 *   ---
 *   title: Drag to reorder stats
 *   tags: [feature]                # any of: feature, fix, headsup, note
 *   visibility: admin              # admin | everyone (default: admin)
 *   image_url: https://...         # optional header image
 *   video_url: https://...         # optional header video (use one or the other)
 *   ---
 *
 *   Body in markdown. Supports headings, bold/italic, lists, links,
 *   blockquotes, inline code, code blocks, and images (paste an image
 *   URL on its own line).
 *
 * After posting, files are moved to supabase/changelog-posted/ so we
 * don't double-publish. Author defaults to CHANGELOG_AUTHOR_EMAIL or
 * mattkettelkamp@gmail.com.
 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
// Next.js stores secrets in .env.local; fall back to .env if missing.
loadEnv({ path: existsSync(".env.local") ? ".env.local" : ".env" });

import { createClient } from "@supabase/supabase-js";
import matter from "gray-matter";
import { marked, type Tokens } from "marked";
import { readFile, rename, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const PENDING_DIR = "supabase/changelog-pending";
const POSTED_DIR = "supabase/changelog-posted";
const AUTHOR_EMAIL =
  process.env.CHANGELOG_AUTHOR_EMAIL ?? "mattkettelkamp@gmail.com";

type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
};

function inlineTokensToTiptap(tokens: Tokens.Generic[] = []): TiptapNode[] {
  const out: TiptapNode[] = [];
  for (const t of tokens) {
    if (t.type === "text" || t.type === "escape") {
      out.push({ type: "text", text: (t as Tokens.Text).text });
    } else if (t.type === "strong") {
      const children = inlineTokensToTiptap((t as Tokens.Strong).tokens);
      out.push(...withMark(children, { type: "bold" }));
    } else if (t.type === "em") {
      const children = inlineTokensToTiptap((t as Tokens.Em).tokens);
      out.push(...withMark(children, { type: "italic" }));
    } else if (t.type === "codespan") {
      out.push({
        type: "text",
        text: (t as Tokens.Codespan).text,
        marks: [{ type: "code" }],
      });
    } else if (t.type === "link") {
      const link = t as Tokens.Link;
      const children = inlineTokensToTiptap(link.tokens);
      out.push(
        ...withMark(children, {
          type: "link",
          attrs: { href: link.href, target: "_blank" },
        })
      );
    } else if (t.type === "br") {
      out.push({ type: "hardBreak" });
    } else if (t.type === "image") {
      // Inline image — flatten to alt text since Tiptap images are block-level.
      const img = t as Tokens.Image;
      out.push({ type: "text", text: img.text ?? "" });
    } else {
      const text = (t as { text?: string }).text;
      if (text) out.push({ type: "text", text });
    }
  }
  return out;
}

function withMark(
  nodes: TiptapNode[],
  mark: { type: string; attrs?: Record<string, unknown> }
): TiptapNode[] {
  return nodes.map((n) => ({
    ...n,
    marks: [...(n.marks ?? []), mark],
  }));
}

function blockTokensToTiptap(tokens: Tokens.Generic[]): TiptapNode[] {
  const out: TiptapNode[] = [];
  for (const t of tokens) {
    if (t.type === "heading") {
      const h = t as Tokens.Heading;
      const level = Math.min(Math.max(h.depth, 1), 3);
      out.push({
        type: "heading",
        attrs: { level },
        content: inlineTokensToTiptap(h.tokens),
      });
    } else if (t.type === "paragraph") {
      const p = t as Tokens.Paragraph;
      // Lone image → block image node
      if (p.tokens?.length === 1 && p.tokens[0].type === "image") {
        const img = p.tokens[0] as Tokens.Image;
        out.push({
          type: "image",
          attrs: {
            src: img.href,
            alt: img.text || null,
            title: img.title || null,
          },
        });
      } else {
        out.push({
          type: "paragraph",
          content: inlineTokensToTiptap(p.tokens),
        });
      }
    } else if (t.type === "list") {
      const list = t as Tokens.List;
      out.push({
        type: list.ordered ? "orderedList" : "bulletList",
        content: list.items.map((item) => ({
          type: "listItem",
          content: blockTokensToTiptap(item.tokens ?? []),
        })),
      });
    } else if (t.type === "blockquote") {
      const bq = t as Tokens.Blockquote;
      out.push({
        type: "blockquote",
        content: blockTokensToTiptap(bq.tokens),
      });
    } else if (t.type === "code") {
      const code = t as Tokens.Code;
      out.push({
        type: "codeBlock",
        attrs: code.lang ? { language: code.lang } : {},
        content: [{ type: "text", text: code.text }],
      });
    } else if (t.type === "hr") {
      out.push({ type: "horizontalRule" });
    } else if (t.type === "space") {
      // ignore
    } else if (t.type === "text") {
      const tt = t as Tokens.Text;
      out.push({
        type: "paragraph",
        content: tt.tokens
          ? inlineTokensToTiptap(tt.tokens)
          : [{ type: "text", text: tt.text }],
      });
    }
  }
  return out;
}

function markdownToTiptap(md: string): TiptapNode {
  const tokens = marked.lexer(md);
  const content = blockTokensToTiptap(tokens);
  return {
    type: "doc",
    content: content.length ? content : [{ type: "paragraph" }],
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Look up the author profile by email.
  const { data: author, error: authorErr } = await supabase
    .from("profiles")
    .select("id, practice_id, full_name")
    .eq("email", AUTHOR_EMAIL)
    .single();

  if (authorErr || !author) {
    throw new Error(
      `Author lookup failed for ${AUTHOR_EMAIL}: ${authorErr?.message ?? "not found"}`
    );
  }

  // Resolve files: explicit args, or scan the pending dir.
  const args = process.argv.slice(2);
  let files: string[];
  if (args.length > 0) {
    files = args.map((a) => path.resolve(a));
  } else {
    if (!existsSync(PENDING_DIR)) {
      console.log(`No ${PENDING_DIR} directory — nothing to post.`);
      return;
    }
    const entries = await readdir(PENDING_DIR);
    files = entries
      .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
      .map((f) => path.join(PENDING_DIR, f))
      .sort();
  }

  if (files.length === 0) {
    console.log("No pending entries.");
    return;
  }

  await mkdir(POSTED_DIR, { recursive: true });

  for (const file of files) {
    const raw = await readFile(file, "utf-8");
    const { data: fm, content: md } = matter(raw);

    const title = (fm.title as string | undefined)?.trim();
    const tags = Array.isArray(fm.tags) ? (fm.tags as string[]) : [];
    const visibility = (fm.visibility as string | undefined) ?? "admin";
    const image_url = (fm.image_url as string | undefined) ?? null;
    const video_url = (fm.video_url as string | undefined) ?? null;

    if (!title) {
      console.error(`✗ ${file}: missing 'title' in frontmatter — skipped`);
      continue;
    }
    if (visibility !== "admin" && visibility !== "everyone") {
      console.error(
        `✗ ${file}: visibility must be 'admin' or 'everyone' — skipped`
      );
      continue;
    }

    const body = markdownToTiptap(md.trim());

    const { data: entry, error } = await supabase
      .from("changelog_entries")
      .insert({
        practice_id: author.practice_id,
        author_id: author.id,
        title,
        body,
        image_url,
        video_url,
        tags,
        visibility,
      })
      .select("id")
      .single();

    if (error) {
      console.error(`✗ ${file}: insert failed — ${error.message}`);
      continue;
    }

    // Mark as read for the author so it doesn't show as unread for them.
    await supabase.from("changelog_reads").insert({
      entry_id: entry.id,
      profile_id: author.id,
      practice_id: author.practice_id,
    });

    const dest = path.join(POSTED_DIR, path.basename(file));
    await rename(file, dest);
    console.log(`✓ Posted "${title}" → ${entry.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
