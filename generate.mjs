// generate.mjs
import fs from 'fs/promises';
import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';

const INDEX_URL = 'https://mykumi.com/sitemap.xml';
const LANGS = ['fr', 'de', 'nl']; // Engels = root
const outputPerLang = {
  en: [],
  fr: [],
  de: [],
  nl: [],
};

const buildXml = (urls) => `
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `
  <url>
    <loc>${url}</loc>
  </url>`).join('')}
</urlset>
`;

const run = async () => {
  console.log('📥 Ophalen van sitemap-index...');
  const indexRes = await fetch(INDEX_URL);
  const indexXml = await indexRes.text();
  const parsedIndex = await parseStringPromise(indexXml);

  const sitemapUrls = parsedIndex.sitemapindex.sitemap.map(s => s.loc[0]);

  console.log(`🔗 ${sitemapUrls.length} sub-sitemaps gevonden`);

  for (const sitemapUrl of sitemapUrls) {
    console.log(`↪️ Laden: ${sitemapUrl}`);
    try {
      const sitemapRes = await fetch(sitemapUrl);
      const sitemapXml = await sitemapRes.text();
      const parsed = await parseStringPromise(sitemapXml);

      if (!parsed.urlset || !parsed.urlset.url) continue;

      const urls = parsed.urlset.url.map(u => u.loc[0]);

      for (const url of urls) {
        const path = new URL(url).pathname;
        const matchedLang = LANGS.find(lang => path.startsWith(`/${lang}/`));
        if (matchedLang) {
          outputPerLang[matchedLang].push(url);
        } else {
          outputPerLang.en.push(url);
        }
      }
    } catch (err) {
      console.warn(`⚠️ Fout bij ${sitemapUrl}: ${err.message}`);
    }
  }

  await fs.mkdir('dist', { recursive: true });

  for (const lang of Object.keys(outputPerLang)) {
    const xml = buildXml(outputPerLang[lang]);
    await fs.writeFile(`dist/${lang}.xml`, xml.trim());
    console.log(`✅ ${lang}.xml geschreven (${outputPerLang[lang].length} URLs)`);
  }
};

run().catch(e => {
  console.error('❌ Er ging iets mis:', e);
  process.exit(1);
});
