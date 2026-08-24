import { useEffect } from 'react';
import type { DocumentDto } from '../types/documents';
import type { SeoMetadata } from './seoConfig';
import { author, siteUrl } from './seoConfig';

export function Seo({ title, description, canonicalPath, type = 'website', noIndex = false, document: material }: SeoMetadata & { document?: DocumentDto }) {
  useEffect(() => {
    const canonicalUrl = new URL(canonicalPath, siteUrl).toString();

    document.title = title;
    setMeta('name', 'description', description);
    setMeta('name', 'robots', noIndex ? 'noindex, follow' : 'index, follow');
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', canonicalUrl);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:locale', 'uk_UA');
    setMeta('name', 'twitter:card', 'summary');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setCanonical(canonicalUrl);
    setStructuredData(createStructuredData({ canonicalUrl, description, document: material, title, type }));
  }, [canonicalPath, description, material, noIndex, title, type]);

  return null;
}

function createStructuredData({ canonicalUrl, description, document, title, type }: {
  canonicalUrl: string;
  description: string;
  document?: DocumentDto;
  title: string;
  type: 'website' | 'article';
}) {
  const person = {
    '@type': 'Person',
    '@id': `${siteUrl}/about#teacher`,
    name: author.name,
    jobTitle: author.jobTitle,
    worksFor: { '@type': 'EducationalOrganization', name: author.workplace }
  };

  const page = document
    ? {
        '@type': 'LearningResource',
        '@id': `${canonicalUrl}#material`,
        name: document.title,
        description,
        url: canonicalUrl,
        inLanguage: 'uk',
        about: document.topic,
        educationalLevel: document.grade === null ? 'Загальний матеріал' : `${document.grade} клас`,
        dateCreated: document.createdAt,
        dateModified: document.updatedAt,
        author: person,
        creator: person
      }
    : { '@type': type === 'article' ? 'Article' : 'WebPage', '@id': canonicalUrl, name: title, description, url: canonicalUrl };

  const graph: object[] = [person, page];
  if (document) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Головна', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Матеріали', item: `${siteUrl}/materials` },
        { '@type': 'ListItem', position: 3, name: document.title, item: canonicalUrl }
      ]
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

function setStructuredData(value: object) {
  let element = document.head.querySelector<HTMLScriptElement>('script[data-seo-structured-data]');
  if (!element) {
    element = document.createElement('script');
    element.type = 'application/ld+json';
    element.dataset.seoStructuredData = '';
    document.head.appendChild(element);
  }
  element.textContent = JSON.stringify(value).replaceAll('<', '\\u003c');
}

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function setCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.appendChild(element);
  }
  element.href = href;
}
