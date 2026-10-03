import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssistantMarkdown } from './AssistantMarkdown';

describe('AssistantMarkdown', () => {
  it('renders Ukrainian headings, emphasis, lists, breaks and code without Markdown controls', () => {
    const { container } = render(<AssistantMarkdown text={'### Натуральні числа\n\n**Формула** і *приклад*\n\n- Один\n- Два\n\n1. Перший\n2. Другий\n\nРядок\nНаступний рядок\n\n`x = 2`'} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Натуральні числа' })).toBeInTheDocument();
    expect(container.querySelector('strong')).toHaveTextContent('Формула');
    expect(container.querySelector('em')).toHaveTextContent('приклад');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(container.querySelector('br')).toBeInTheDocument();
    expect(container.querySelector('code')).toHaveTextContent('x = 2');
    expect(container).not.toHaveTextContent('###'); expect(container).not.toHaveTextContent('**');
  });
  it('renders inline and block backslash math with Ukrainian text, fractions, roots and inequalities', () => {
    const text = String.raw`**Квадратне рівняння**. Функція \(f(x)=x^2\), де \(x \ge 0\).

\[
x = \frac{-b \pm \sqrt{D}}{2a}
\]

де

\[D = b^2 - 4ac\]`;
    const { container } = render(<AssistantMarkdown text={text} />);
    expect(container.querySelectorAll('.katex')).toHaveLength(4);
    expect(container.querySelectorAll('.katex-display')).toHaveLength(2);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('\\('); expect(container).not.toHaveTextContent('\\)');
    expect(container).not.toHaveTextContent('\\['); expect(container).not.toHaveTextContent('\\]');
    expect(screen.getByText('Квадратне рівняння')).toBeInTheDocument();
  });
  it('supports dollar math and leaves math-like syntax inside code alone', () => {
    const { container } = render(<AssistantMarkdown text={'Тут $x^2$ і `\\(literal\\)`.\n\n$$\n\\frac{1}{2}\n$$'} />);
    expect(container.querySelectorAll('.katex')).toHaveLength(2);
    expect(container.querySelector('code')).toHaveTextContent('\\(literal\\)');
  });
  it('discards raw HTML and remote images, blocks unsafe links and untrusted math HTML', () => {
    const { container } = render(<AssistantMarkdown text={String.raw`<script>alert('secret')</script>

<img src=x onerror=alert(1)>

[небезпечно](javascript:alert(1)) ![tracker](https://example.com/tracker)

\(\href{javascript:alert(1)}{click}\)

[Матеріали](/materials) [Джерело](https://example.com/lesson)`} />);
    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('[onerror]')).not.toBeInTheDocument();
    expect(container.querySelector('a[href^="javascript:"]')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Матеріали' })).toHaveAttribute('href', '/materials');
    expect(screen.getByRole('link', { name: 'Джерело' })).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
