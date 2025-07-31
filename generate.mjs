// generate.mjs v4 – robuustere versie met retry-logica
import fs from 'fs/promises';
import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';

const INDEX_URL = 'https://mykumi.com/sitemap.xml';
const LANGS = ['fr', 'de', 'nl']; // 'en' is zonder prefix
const MAX_RETRIES = 3;

const perFileContent = {};
const perLangIndex = {};

const buildXml = (urls) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `<url><loc>${u}</loc></url>`).join('\n')}
</urlset>`;

const buildIndex = (files) => `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${files.map(f => `<sitemap><loc>https://sitemap.mykumi.com/${f}</loc></sitemap>`).join('\n')}
</sitemapindex>`;

const fetchWithRetry = async (url, retries = MAX_RETRIES) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      console.warn(`⏳ Retry ${attempt}/${retries} for ${url} (${err.message})`);
      if (attempt === retries) throw err;
      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    }
  }
};

const run = async () => {
  const indexXml = await fetchWithRetry(INDEX_URL);
  const parsedIndex = await parseStringPromise(indexXml);
  const sitemapUrls = parsedIndex.sitemapindex.sitemap.map(s => s.loc[0]);

  for (const sitemapUrl of sitemapUrls) {
    try {
      const url = new URL(sitemapUrl);
      const path = url.pathname.replace(/\?.*$/, '');
      const match = path.match(/^\/(?:(fr|de|nl)\/)?sitemap_(products|pages|collections|blogs)_(\d+)/);
      if (!match) continue;

      const [, langMatch, type, chunk] = match;
      const lang = langMatch || 'en';
      const fileName = `${lang}-${type}-${chunk}.xml`;

      const xml = await fetchWithRetry(sitemapUrl);
      const parsed = await parseStringPromise(xml);
      const urls = parsed.urlset?.url?.map(u => u.loc[0]) || [];

      if (!urls.length) {
        console.warn(`⚠️  ${fileName} is leeg – overgeslagen.`);
        continue;
      }

      perFileContent[fileName] = buildXml(urls);
      perLangIndex[lang] = perLangIndex[lang] || [];
      perLangIndex[lang].push(fileName);

      console.log(`✅ ${fileName} (${urls.length} URLs)`);
    } catch (err) {
      console.warn(`❌ Fout bij ${sitemapUrl}: ${err.message}`);
    }
  }

  await fs.mkdir('dist', { recursive: true });

  for (const file in perFileContent) {
    await fs.writeFile(`dist/${file}`, perFileContent[file]);
  }

  for (const lang in perLangIndex) {
    perLangIndex[lang] = perLangIndex[lang].filter(f => f.endsWith('.xml'));
    const xml = buildIndex(perLangIndex[lang]);
    await fs.writeFile(`dist/${lang}.xml`, xml);
    await fs.writeFile(`dist/${lang}-index.xml`, xml);
    console.log(`📦 ${lang}.xml en ${lang}-index.xml (${perLangIndex[lang].length} bestanden)`);
  }
};

run().catch(err => {
  console.error('❌ Script mislukt:', err);
  process.exit(1);
});
