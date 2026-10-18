import DOMPurify from 'dompurify';

/**
 * Text formatting only: no forms, images, <style> or style attributes, so
 * untrusted HTML (an invitation's description, imported text in a note)
 * can't fake parts of the app, load trackers or restyle the page.
 */
const CONFIG = {
  ALLOWED_TAGS: [
    'a',
    'b',
    'strong',
    'i',
    'em',
    'u',
    's',
    'del',
    'br',
    'p',
    'ul',
    'ol',
    'li',
    'code',
    'pre',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'span',
  ],
  ALLOWED_ATTR: ['href'],
  ALLOW_ARIA_ATTR: false,
  ALLOW_DATA_ATTR: false,
  SANITIZE_NAMED_PROPS: true,
};

// Links open in a new tab, without a handle back to this one.
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Untrusted HTML reduced to text formatting and links, safe to render. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, CONFIG);
}
