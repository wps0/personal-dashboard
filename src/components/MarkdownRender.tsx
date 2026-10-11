// Loaded on first use (with marked and DOMPurify), not with the app.
import DOMPurify from 'dompurify';
import {marked} from 'marked';
import {useMemo} from 'react';

export default function MarkdownRender({source}: {source: string}) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(source, {async: false})),
    [source],
  );
  return <div className="prose-md" dangerouslySetInnerHTML={{__html: html}} />;
}
