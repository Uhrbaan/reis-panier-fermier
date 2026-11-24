// Live preview of the producer's *unsaved* description (`C2-F1`).
//
// The authoritative rendition is produced by the server and stored in
// `farms.description_html` (`ADR-04`): sanitising happens once, at the write
// boundary, so every consumer of a saved farm receives already-safe HTML.
//
// This module exists only for the editor's "Aperçu" tab, where the producer is
// still typing and nothing has been persisted yet. It is therefore loaded
// lazily (`import()` in `FarmEditor.vue`) so that public visitors — who only
// ever read the server-rendered HTML — never download `marked` or `DOMPurify`.
//
// The output is still sanitised before it reaches `v-html`: this is a second
// line of defence, not the primary one.

import DOMPurify from "dompurify";
import { Marked, type RendererObject, type Tokens } from "marked";

/** Same allowlist as `backend/src/services/markdown.ts` — keep the two in sync. */
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "del",
  "code",
  "pre",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "blockquote",
  "hr",
  "a",
];

/** Escape a value interpolated into an attribute position. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const farmRenderer: RendererObject = {
  html(): string {
    return "";
  },

  heading({ tokens, depth }: Tokens.Heading): string {
    const tag = depth <= 3 ? "h3" : "h4";
    const classes =
      tag === "h3"
        ? "text-base font-semibold text-gray-900 mt-3 mb-1"
        : "text-sm font-semibold text-gray-900 mt-3 mb-1";
    return `<${tag} class="${classes}">${this.parser.parseInline(tokens)}</${tag}>`;
  },

  paragraph({ tokens }: Tokens.Paragraph): string {
    return `<p class="leading-relaxed">${this.parser.parseInline(tokens)}</p>`;
  },

  list(token: Tokens.List): string {
    const tag = token.ordered ? "ol" : "ul";
    const classes = token.ordered
      ? "list-decimal pl-5 space-y-1 my-2"
      : "list-disc pl-5 space-y-1 my-2";
    const body = token.items.map((item) => this.listitem(item)).join("");
    return `<${tag} class="${classes}">${body}</${tag}>`;
  },

  listitem(item: Tokens.ListItem): string {
    return `<li>${this.parser.parse(item.tokens)}</li>`;
  },

  link({ href, title, tokens }: Tokens.Link): string {
    const label = this.parser.parseInline(tokens);
    const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
    return `<a href="${escapeAttr(href)}"${titleAttr} target="_blank" rel="noopener nofollow" class="text-green-800 underline">${label}</a>`;
  },

  blockquote({ tokens }: Tokens.Blockquote): string {
    return `<blockquote class="border-l-4 border-green-200 pl-3 my-2 italic text-gray-700">${this.parser.parse(tokens)}</blockquote>`;
  },

  hr(): string {
    return '<hr class="my-3 border-gray-200" />';
  },

  br(): string {
    return "<br />";
  },
};

const marked = new Marked({
  gfm: true,
  breaks: true,
  async: false,
});

marked.use({ renderer: farmRenderer });

/** Render unsaved Markdown to sanitised HTML, ready for `v-html`. */
export function renderMarkdownPreview(source: string): string {
  if (!source.trim()) return "";

  const html = marked.parse(source, { async: false }) as string;

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "title", "target", "rel", "class"],
    KEEP_CONTENT: true,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
    FORBID_ATTR: ["style", "srcset", "onerror", "onload", "onclick"],
  });
}
