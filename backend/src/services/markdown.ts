import { Marked, type RendererObject, type Tokens } from 'marked';
import sanitizeHtml from 'sanitize-html';

/**
 * Server-side rendering of the producer's storefront description (`C2-F1`).
 *
 * The producer types Markdown; we store it verbatim as the source of truth
 * (`farms.description`) *and* a sanitised HTML rendition
 * (`farms.description_html`) that public clients render as-is.
 *
 * Sanitising happens here, at the write boundary, and never on the client:
 *  - the stored HTML is safe for *every* future consumer (web page, map popup,
 *    admin review screen, mobile client), so no consumer can forget to escape;
 *  - reading a farm becomes a plain column read instead of a Markdown parse,
 *    which keeps the public listing fast (`C2-NF1`).
 *
 * The raw Markdown is retained so the rendition can be recomputed if the
 * allowlist is tightened or a sanitiser advisory lands — stored HTML alone
 * would be un-fixable after the fact.
 */

/** Tags allowed through the sanitiser: nothing scriptable, no embeds. */
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'del',
  'code',
  'pre',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'a',
];

const ALLOWED_ATTRIBUTES = {
  a: ['href', 'title', 'target', 'rel', 'class'],
  p: ['class'],
  h3: ['class'],
  h4: ['class'],
  ul: ['class'],
  ol: ['class'],
  blockquote: ['class'],
  hr: ['class'],
};

/** Escape a value interpolated into an attribute position. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const farmRenderer: RendererObject = {
  /** Never emit raw HTML coming from the source. */
  html(): string {
    return '';
  },

  heading({ tokens, depth }: Tokens.Heading): string {
    // The editor only offers "Titre"; `##` maps to h3 so it stays a sub-heading
    // inside the farm page's existing h2 section title.
    const tag = depth <= 3 ? 'h3' : 'h4';
    const classes =
      tag === 'h3'
        ? 'text-base font-semibold text-gray-900 mt-3 mb-1'
        : 'text-sm font-semibold text-gray-900 mt-3 mb-1';
    return `<${tag} class="${classes}">${this.parser.parseInline(tokens)}</${tag}>`;
  },

  paragraph({ tokens }: Tokens.Paragraph): string {
    return `<p class="leading-relaxed">${this.parser.parseInline(tokens)}</p>`;
  },

  list(token: Tokens.List): string {
    const tag = token.ordered ? 'ol' : 'ul';
    const classes = token.ordered
      ? 'list-decimal pl-5 space-y-1 my-2'
      : 'list-disc pl-5 space-y-1 my-2';
    const body = token.items.map((item) => this.listitem(item)).join('');
    return `<${tag} class="${classes}">${body}</${tag}>`;
  },

  listitem(item: Tokens.ListItem): string {
    // `parse` (not `parseInline`) so a list item may contain nested blocks.
    return `<li>${this.parser.parse(item.tokens)}</li>`;
  },

  link({ href, title, tokens }: Tokens.Link): string {
    const label = this.parser.parseInline(tokens);
    const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
    // `rel`/`target` are forced: producer-supplied links open in a new tab and
    // cannot reach back through `window.opener`.
    return `<a href="${escapeAttr(href)}"${titleAttr} target="_blank" rel="noopener noreferrer nofollow" class="text-green-800 underline">${label}</a>`;
  },

  blockquote({ tokens }: Tokens.Blockquote): string {
    return `<blockquote class="border-l-4 border-green-200 pl-3 my-2 italic text-gray-700">${this.parser.parse(tokens)}</blockquote>`;
  },

  hr(): string {
    return '<hr class="my-3 border-gray-200" />';
  },

  br(): string {
    return '<br />';
  },
};

const marked = new Marked({
  gfm: true,
  breaks: true, // producers type opening hours one line per day
  async: false,
});

marked.use({ renderer: farmRenderer });

/**
 * Convert the producer's Markdown description into HTML that is safe to serve
 * and to bind with `v-html` on the client.
 *
 * Returns `''` for empty input so the caller never stores markup for a blank
 * description.
 */
export function renderDescription(markdown: string): string {
  if (!markdown.trim()) {
    return '';
  }

  const rendered = marked.parse(markdown, { async: false }) as string;

  return sanitizeHtml(rendered, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    // Producer-supplied links must never be able to run script.
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
    transformTags: {
      // Force the safe rel/target pair regardless of what Markdown produced.
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
        },
      }),
    },
  });
}
