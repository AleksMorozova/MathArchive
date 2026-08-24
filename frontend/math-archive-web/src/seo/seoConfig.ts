import type { DocumentDto } from '../types/documents';

export const siteUrl = 'https://morozovamath.com';
export const siteName = 'Математика з Тетяною Морозовою';

export interface SeoMetadata {
  title: string;
  description: string;
  canonicalPath: string;
  type?: 'website' | 'article';
  noIndex?: boolean;
}

export const homeSeo: SeoMetadata = {
  title: 'Навчальні матеріали з математики | Морозова Тетяна',
  description: 'Формули, контрольні, самостійні роботи та навчальні матеріали з математики для учнів 5–11 класів від досвідченого вчителя.',
  canonicalPath: '/'
};

export const aboutSeo: SeoMetadata = {
  title: 'Про вчителя математики Тетяну Морозову',
  description: 'Про педагогічний досвід Тетяни Морозової та добірку навчальних матеріалів з математики для учнів, батьків і вчителів.',
  canonicalPath: '/about'
};

export function getMaterialsSeo(classFilter: string, topicFilter: string): SeoMetadata {
  const validClass = /^(5|6|7|8|9|10|11|general)$/.test(classFilter) ? classFilter : '';
  const classLabel = validClass === 'general' ? 'загальні' : validClass ? `для ${validClass} класу` : '';
  const normalizedTopic = topicFilter.trim();
  const titlePrefix = normalizedTopic
    ? `${normalizedTopic}: матеріали з математики${classLabel ? ` ${classLabel}` : ''}`
    : `Навчальні матеріали з математики${classLabel ? ` ${classLabel}` : ''}`;
  const description = normalizedTopic
    ? `Навчальні матеріали з теми «${normalizedTopic}»${classLabel ? ` ${classLabel}` : ''}: теорія, формули, самостійні та контрольні роботи.`
    : `Добірка матеріалів з математики${classLabel ? ` ${classLabel}` : ' для 5–11 класів'}: теорія, формули, самостійні та контрольні роботи.`;

  return {
    title: `${titlePrefix} | Морозова Тетяна`,
    description,
    canonicalPath: validClass ? `/materials?class=${validClass}` : '/materials',
    noIndex: Boolean(normalizedTopic || (classFilter && !validClass))
  };
}

export function getDocumentSeo(document: DocumentDto): SeoMetadata {
  const gradeLabel = document.grade === null ? 'загальний матеріал' : `${document.grade} клас`;

  return {
    title: `${document.title} — ${gradeLabel} | Математика`,
    description: document.description?.trim() || `${document.title}. Навчальний матеріал з теми «${document.topic}», ${gradeLabel}.`,
    canonicalPath: `/materials/${document.id}`,
    type: 'article'
  };
}
