import { Box } from '@mui/material';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math-extended';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

function safeUrl(url: string) {
  if (url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')) return url;
  if (url.startsWith('#')) return url;
  try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : ''; }
  catch { return ''; }
}
export function AssistantMarkdown({ text }: { text: string }) {
  return <Box className="assistant-markdown" sx={{ color: '#082B5C', lineHeight: 1.75, overflowWrap: 'anywhere', minWidth: 0,
    '& p': { my: 1.5 }, '& p:first-of-type': { mt: 0 }, '& p:last-child': { mb: 0 },
    '& h1, & h2, & h3, & h4, & h5, & h6': { fontSize: '1.12rem', fontWeight: 700, lineHeight: 1.4, mt: 2, mb: 1 },
    '& ul, & ol': { pl: 3, my: 1.5 }, '& li + li': { mt: 0.5 },
    '& a': { color: '#082B5C', textDecorationColor: '#E8AE18', textUnderlineOffset: '3px' },
    '& pre': { bgcolor: '#EAF5FC', p: 1.5, borderRadius: 2, overflowX: 'auto' },
    '& code:not(.language-math)': { fontSize: '0.9em', bgcolor: '#EAF5FC', px: 0.5, borderRadius: 0.5 },
    '& .katex-display': { maxWidth: '100%', overflowX: 'auto', overflowY: 'hidden', py: 1, my: 1.5 },
    '& .katex': { overflowWrap: 'normal', fontSize: '1.08em' }, '& blockquote': { m: 0, pl: 2, borderLeft: '3px solid #E8AE18' },
  }}>
    <Markdown skipHtml urlTransform={safeUrl} remarkPlugins={[remarkMath, remarkBreaks]}
      rehypePlugins={[[rehypeKatex, { trust: false, strict: 'ignore', maxExpand: 500, maxSize: 20 }]]}
      components={{
        a: ({ href, children }) => href ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
        img: () => null,
      }}>{text}</Markdown>
  </Box>;
}
