import {lazy, Suspense} from 'react';

const load = () => import('./MarkdownRender');
const MarkdownRender = lazy(load);

/** Fetches the renderer ahead of time (see App). */
export const preloadMarkdown = load;

/**
 * Rendered Markdown. The parser and sanitizer load on first use; until then
 * the source shows as plain text.
 */
export function Markdown({source}: {source: string}) {
  return (
    <Suspense
      fallback={<div className="prose-md whitespace-pre-wrap">{source}</div>}
    >
      <MarkdownRender source={source} />
    </Suspense>
  );
}
