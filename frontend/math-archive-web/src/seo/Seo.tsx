import { useEffect } from 'react';
import type { SeoMetadata } from './seoConfig';
import { siteUrl } from './seoConfig';

export function Seo({ title, description, canonicalPath, type = 'website', noIndex = false }: SeoMetadata) {
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
  }, [canonicalPath, description, noIndex, title, type]);

  return null;
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
