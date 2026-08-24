import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Seo } from './Seo';
import { getDocumentSeo, getMaterialsSeo } from './seoConfig';
import type { DocumentDto } from '../types/documents';

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

  it('creates specific, concise material metadata', () => {
    const vectorSeo = getDocumentSeo(createDocument({
      title: 'Вектори',
      description: 'Основні поняття, властивості та дії з векторами на площині.',
      topic: 'Вектори на площині'
    }));
    const longSeo = getDocumentSeo(createDocument({
      title: 'Комбінаторика, теорія ймовірностей та статистика',
      description: 'Основні поняття, правила та формули.',
      topic: 'Комбінаторика та ймовірність'
    }));

    expect(vectorSeo.title).toBe('Вектори: Вектори на площині | 9 клас');
    expect(longSeo.title).toBe('Комбінаторика, теорія ймовірностей та статистика | 9 клас');
    expect(vectorSeo.description).toContain('Тема: «Вектори на площині», 9 клас.');
    expect(vectorSeo.title.length).toBeGreaterThanOrEqual(30);
    expect(longSeo.title.length).toBeLessThanOrEqual(60);
  });

  it('adds person, author, and breadcrumb structured data for a material', async () => {
    const material = createDocument();
    const metadata = getDocumentSeo(material);
    render(<Seo {...metadata} document={material} />);

    await waitFor(() => expect(document.head.querySelector('script[data-seo-structured-data]')).toBeInTheDocument());
    const value = JSON.parse(document.head.querySelector('script[data-seo-structured-data]')?.textContent ?? '{}');
    expect(value['@graph']).toEqual(expect.arrayContaining([
      expect.objectContaining({ '@type': 'Person', name: 'Морозова Тетяна Володимирівна' }),
      expect.objectContaining({
        '@type': 'LearningResource',
        author: expect.objectContaining({ '@type': 'Person', '@id': 'https://morozovamath.com/about#teacher' }),
        dateCreated: '2026-01-01T00:00:00Z',
        dateModified: '2026-01-01T00:00:00Z'
      }),
      expect.objectContaining({ '@type': 'BreadcrumbList' })
    ]));
  });
});

function createDocument(overrides: Partial<DocumentDto> = {}): DocumentDto {
  return {
    id: 'document-id',
    title: 'Матеріал для перевірки',
    description: 'Опис матеріалу',
    grade: 9,
    topic: 'Геометрія',
    documentType: 'Theory',
    originalFileName: 'material.pdf',
    contentType: 'application/pdf',
    fileSize: 1024,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    downloadCount: 0,
    ...overrides
  };
}
