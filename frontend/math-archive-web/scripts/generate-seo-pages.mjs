import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnv } from 'vite';
import { fetchDocuments, TransientSeoApiError } from './seo-api.mjs';

const siteUrl = 'https://morozovamath.com';
const environment = loadEnv('production', process.cwd(), '');
const configuredApiBaseUrl = process.env.VITE_API_BASE_URL || environment.VITE_API_BASE_URL;
const googleSiteVerification = (process.env.VITE_GOOGLE_SITE_VERIFICATION || environment.VITE_GOOGLE_SITE_VERIFICATION || '').trim();
if (!configuredApiBaseUrl?.trim()) {
  throw new Error('VITE_API_BASE_URL must be configured for SEO generation.');
}
const apiBaseUrl = configuredApiBaseUrl.trim().replace(/\/+$/, '');
let parsedApiBaseUrl;
try {
  parsedApiBaseUrl = new URL(apiBaseUrl);
} catch {
  throw new Error('VITE_API_BASE_URL must be a valid absolute URL.');
}
if (parsedApiBaseUrl.protocol !== 'http:' && parsedApiBaseUrl.protocol !== 'https:') {
  throw new Error('VITE_API_BASE_URL must use HTTP or HTTPS.');
}
const outputDirectory = new URL('../dist/', import.meta.url);
const materialPagesDirectory = new URL('materials/', outputDirectory);
const template = (await readFile(new URL('index.html', outputDirectory), 'utf8'))
  .replace(/<!-- seo-snapshot:start -->[\s\S]*?<!-- seo-snapshot:end -->/, '')
  .replace(/\s*<meta name="google-site-verification" content="[^"]*" \/>/g, '')
  .replace(/\s*<script type="application\/ld\+json" data-seo-structured-data>[\s\S]*?<\/script>/g, '');

const homeMetadata = {
  title: 'Навчальні матеріали з математики | Морозова Тетяна',
  description: 'Формули, контрольні, самостійні роботи та навчальні матеріали з математики для учнів 5–11 класів від досвідченого вчителя.',
  canonicalPath: '/'
};

const materialsMetadata = {
  title: 'Навчальні матеріали з математики для 5–11 класів',
  description: 'Добірка матеріалів з математики для 5–11 класів: теорія, формули, самостійні та контрольні роботи.',
  canonicalPath: '/materials'
};

const aboutMetadata = {
  title: 'Про вчителя математики Тетяну Морозову',
  description: 'Про педагогічний досвід Тетяни Морозової та добірку навчальних матеріалів з математики для учнів, батьків і вчителів.',
  canonicalPath: '/about'
};

const author = {
  name: 'Морозова Тетяна Володимирівна',
  jobTitle: 'Учитель математики',
  workplace: 'Ліцей №23 «Соборний» ДМР'
};

await rm(materialPagesDirectory, { recursive: true, force: true });

let documents = [];
let generatedDynamicPages = false;
try {
  documents = await fetchDocuments({ apiBaseUrl });
  generatedDynamicPages = true;
} catch (error) {
  if (!(error instanceof TransientSeoApiError)) {
    throw error;
  }

  console.warn(`${error.message}. Continuing with stable SEO pages and the base sitemap only.`);
}

await renderPage('index.html', homeMetadata, `
  <h1>Морозова Тетяна Володимирівна</h1>
  <p><strong>Вчитель математики з понад 30-річним досвідом</strong></p>
  <p>Ліцей №23 «Соборний» ДМР</p>
  <h2>Навчальні матеріали з математики</h2>
  <p>Формули, контрольні та самостійні роботи, пам’ятки й методичні матеріали для учнів і вчителів.</p>
  <p><a href="/materials">Переглянути всі матеріали</a></p>
  <h2>Матеріали за класами</h2>
  <ul>${[5, 6, 7, 8, 9, 10, 11].map((grade) => `<li><a href="/materials?class=${grade}">${grade} клас</a></li>`).join('')}<li><a href="/materials?class=general">Загальні матеріали</a></li></ul>
`);

await renderPage('materials.html', materialsMetadata, `
  <h1>Навчальні матеріали</h1>
  <p>Знайдіть контрольні, самостійні роботи та теоретичні матеріали з математики.</p>
  ${documents.length === 0 ? '<p>Перелік матеріалів завантажується після відкриття сторінки.</p>' : `<p>Опубліковано матеріалів: ${documents.length}</p><ul>${documents.map(renderDocumentLink).join('')}</ul>`}
`);

await renderPage('about.html', aboutMetadata, `
  <h1>Про вчителя</h1>
  <h2>Морозова Тетяна Володимирівна</h2>
  <p>Учитель математики з понад 30-річним педагогічним стажем у Дніпровському полімовному ліцеї №23 «Соборний».</p>
  <p>Матеріали створені та відібрані на основі багаторічного досвіду роботи з учнями й орієнтовані на практичне використання під час уроків та самостійного навчання.</p>
  <h2>Про MathArchive</h2>
  <p>Це зібрання конспектів, формул, самостійних і контрольних робіт, презентацій та карток із завданнями з математики.</p>
`);

if (generatedDynamicPages) {
  await mkdir(materialPagesDirectory, { recursive: true });
  for (const document of documents) {
    const gradeLabel = document.grade === null ? 'Загальний матеріал' : `${document.grade} клас`;
    const metadata = {
      title: createDocumentSeoTitle(document.title, document.topic, gradeLabel.toLowerCase()),
      description: createDocumentSeoDescription(document, gradeLabel.toLowerCase()),
      canonicalPath: `/materials/${document.id}`,
      type: 'article',
      document
    };

    await renderPage(join('materials', `${document.id}.html`), metadata, `
      <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Головна</a> / <a href="/materials">Матеріали</a> / <span aria-current="page">${escapeHtml(document.title)}</span></nav>
      <article>
        <h1>${escapeHtml(document.title)}</h1>
        ${document.description ? `<p>${escapeHtml(document.description)}</p>` : ''}
        <p class="material-byline"><span>Автор навчального матеріалу:</span> <a href="/about" rel="author">${escapeHtml(author.name)}</a>, ${escapeHtml(author.jobTitle.toLowerCase())} із понад 30-річним педагогічним досвідом</p>
        <dl>
          <dt>Клас</dt><dd>${escapeHtml(gradeLabel)}</dd>
          <dt>Тема</dt><dd>${escapeHtml(document.topic)}</dd>
        </dl>
      </article>
    `);
  }
}

await writeFile(new URL('sitemap.xml', outputDirectory), createSitemap(documents), 'utf8');
if (generatedDynamicPages) {
  console.log(`Generated SEO snapshots for 3 public pages and ${documents.length} material pages.`);
} else {
  console.warn('Generated 3 stable SEO pages. Material pages and material sitemap entries were not included in this build.');
}

async function renderPage(fileName, metadata, content) {
  const canonicalUrl = new URL(metadata.canonicalPath, siteUrl).toString();
  const structuredData = createStructuredData(metadata, canonicalUrl);
  const verificationTag = googleSiteVerification
    ? `    <meta name="google-site-verification" content="${escapeAttribute(googleSiteVerification)}" />\n`
    : '';
  const page = template
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(metadata.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeAttribute(metadata.description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${canonicalUrl}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escapeAttribute(metadata.title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${escapeAttribute(metadata.description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${canonicalUrl}" />`)
    .replace(/<meta property="og:type" content="[^"]*" \/>/, `<meta property="og:type" content="${metadata.type || 'website'}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${escapeAttribute(metadata.title)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${escapeAttribute(metadata.description)}" />`)
    .replace('</head>', `${verificationTag}    <script type="application/ld+json" data-seo-structured-data>${escapeJsonForHtml(structuredData)}</script>\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root"><!-- seo-snapshot:start -->${renderShell(content)}<!-- seo-snapshot:end --></div>`);

  await writeFile(new URL(fileName.replaceAll('\\', '/'), outputDirectory), page, 'utf8');
}

function createStructuredData(metadata, canonicalUrl) {
  const personId = `${siteUrl}/about#teacher`;
  const person = {
    '@type': 'Person',
    '@id': personId,
    name: author.name,
    jobTitle: author.jobTitle,
    worksFor: { '@type': 'EducationalOrganization', name: author.workplace }
  };
  const page = metadata.document
    ? {
        '@type': 'LearningResource',
        '@id': `${canonicalUrl}#material`,
        name: metadata.document.title,
        description: metadata.description,
        url: canonicalUrl,
        inLanguage: 'uk',
        about: metadata.document.topic,
        educationalLevel: metadata.document.grade === null ? 'Загальний матеріал' : `${metadata.document.grade} клас`,
        dateCreated: metadata.document.createdAt,
        dateModified: metadata.document.updatedAt,
        author: person,
        creator: person
      }
    : { '@type': 'WebPage', '@id': canonicalUrl, name: metadata.title, description: metadata.description, url: canonicalUrl };
  const graph = [person, page];

  if (metadata.document) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Головна', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Матеріали', item: `${siteUrl}/materials` },
        { '@type': 'ListItem', position: 3, name: metadata.document.title, item: canonicalUrl }
      ]
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

function createDocumentSeoTitle(title, topic, gradeLabel) {
  let result = `${title} | ${gradeLabel} — математика`;
  if (result.length < 30 && topic.trim() && topic.trim() !== title.trim()) {
    result = `${title}: ${topic.trim()} | ${gradeLabel}`;
  }
  if (result.length > 60) {
    result = `${title} | ${gradeLabel}`;
  }
  return result.length > 60 ? title : result;
}

function createDocumentSeoDescription(document, gradeLabel) {
  const summary = document.description?.trim() || 'Навчальний матеріал з математики.';
  return `${document.title}: ${summary.replace(/[.!?]+$/, '')}. Тема: «${document.topic}», ${gradeLabel}.`;
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function renderShell(content) {
  return `<div class="seo-snapshot">
    <header><a href="/">Математика з Тетяною Морозовою</a><nav aria-label="Основна навігація"><a href="/">Головна</a> <a href="/materials">Матеріали</a> <a href="/about">Про сайт</a></nav></header>
    <main>${content}</main>
    <footer>Навчальні матеріали з математики</footer>
  </div>`;
}

function renderDocumentLink(document) {
  const gradeLabel = document.grade === null ? 'загальний матеріал' : `${document.grade} клас`;
  return `<li><a href="/materials/${encodeURIComponent(document.id)}">${escapeHtml(document.title)}</a> — ${escapeHtml(gradeLabel)}, ${escapeHtml(document.topic)}</li>`;
}

function createSitemap(items) {
  const urls = [
    { path: '/' },
    { path: '/materials' },
    { path: '/about' },
    ...items.map((document) => ({ path: `/materials/${document.id}`, lastModified: document.updatedAt }))
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(({ path, lastModified }) => {
    const lastmod = lastModified ? `<lastmod>${new Date(lastModified).toISOString().slice(0, 10)}</lastmod>` : '';
    return `  <url><loc>${escapeXml(new URL(path, siteUrl).toString())}</loc>${lastmod}</url>`;
  }).join('\n')}\n</urlset>\n`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('\n', ' ');
}

function escapeXml(value) {
  return escapeHtml(value);
}
