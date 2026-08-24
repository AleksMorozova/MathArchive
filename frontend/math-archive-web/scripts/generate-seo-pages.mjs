import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchDocuments } from './seo-api.mjs';

const siteUrl = 'https://morozovamath.com';
const apiBaseUrl = (process.env.VITE_API_BASE_URL || 'https://matharchive.onrender.com').replace(/\/+$/, '');
const outputDirectory = new URL('../dist/', import.meta.url);
const template = (await readFile(new URL('index.html', outputDirectory), 'utf8'))
  .replace(/<!-- seo-snapshot:start -->[\s\S]*?<!-- seo-snapshot:end -->/, '');

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

const documents = await fetchDocuments({ apiBaseUrl });

await renderPage('index.html', homeMetadata, `
  <h1>Матеріали з математики</h1>
  <p>Формули, контрольні роботи, самостійні завдання та методичні матеріали для учнів і вчителів.</p>
  <h2>Матеріали від вчителя з понад 30-річним досвідом</h2>
  <p>Морозова Тетяна Володимирівна — вчитель математики Ліцею №23 «Соборний» ДМР.</p>
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

await mkdir(new URL('materials/', outputDirectory), { recursive: true });
for (const document of documents) {
  const gradeLabel = document.grade === null ? 'Загальний матеріал' : `${document.grade} клас`;
  const metadata = {
    title: `${document.title} — ${gradeLabel.toLowerCase()} | Математика`,
    description: document.description?.trim() || `${document.title}. Навчальний матеріал з теми «${document.topic}», ${gradeLabel.toLowerCase()}.`,
    canonicalPath: `/materials/${document.id}`,
    type: 'article'
  };

  await renderPage(join('materials', `${document.id}.html`), metadata, `
    <p><a href="/materials">Назад до матеріалів</a></p>
    <article>
      <h1>${escapeHtml(document.title)}</h1>
      ${document.description ? `<p>${escapeHtml(document.description)}</p>` : ''}
      <dl>
        <dt>Клас</dt><dd>${escapeHtml(gradeLabel)}</dd>
        <dt>Тема</dt><dd>${escapeHtml(document.topic)}</dd>
      </dl>
    </article>
  `);
}

await writeFile(new URL('sitemap.xml', outputDirectory), createSitemap(documents), 'utf8');
console.log(`Generated SEO snapshots for 3 public pages and ${documents.length} material pages.`);

async function renderPage(fileName, metadata, content) {
  const canonicalUrl = new URL(metadata.canonicalPath, siteUrl).toString();
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
    .replace('<div id="root"></div>', `<div id="root"><!-- seo-snapshot:start -->${renderShell(content)}<!-- seo-snapshot:end --></div>`);

  await writeFile(new URL(fileName.replaceAll('\\', '/'), outputDirectory), page, 'utf8');
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
