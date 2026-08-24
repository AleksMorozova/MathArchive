import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Seo } from './Seo';
import { getMaterialsSeo } from './seoConfig';

describe('SEO metadata', () => {
  it('updates the document metadata and canonical URL', async () => {
    render(
      <Seo
        title="Матеріали для 7 класу"
        description="Навчальні матеріали з алгебри."
        canonicalPath="/materials?class=7"
      />
    );

    await waitFor(() => expect(document.title).toBe('Матеріали для 7 класу'));
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute('content', 'Навчальні матеріали з алгебри.');
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
    expect(document.head.querySelector('meta[property="og:url"]')).toHaveAttribute('content', 'https://morozovamath.com/materials?class=7');
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'https://morozovamath.com/materials?class=7');
  });

  it('keeps stable class pages indexable but marks topic searches as noindex', () => {
    expect(getMaterialsSeo('7', '').canonicalPath).toBe('/materials?class=7');
    expect(getMaterialsSeo('7', '').noIndex).toBe(false);
    expect(getMaterialsSeo('7', 'Алгебра')).toMatchObject({
      canonicalPath: '/materials?class=7',
      noIndex: true
    });
  });
});
