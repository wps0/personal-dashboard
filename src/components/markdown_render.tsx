// Loaded on first use (with marked), not with the app.
import {marked} from 'marked';
import {useMemo} from 'react';
import {sanitizeHtml} from '../sanitize';

export function MarkdownRender({source}: {source: string}) {
  const html = useMemo(
    () => sanitizeHtml(marked.parse(source, {async: false})),
    [source],
  );
  return <div className="prose-md" dangerouslySetInnerHTML={{__html: html}} />;
}
