// generate.mjs – Shopify → taalgesplitste sitemaps
import fs from 'fs/promises';
import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';

const INDEX_URL = 'https://mykumi.com/sitemap.xml';
const LANGS = ['fr', 'de', 'nl']; // 'en' is zonder prefix

const perFileContent = {}; // bv. fr-products-1.xml => XML-string
const perLangIndex = {};   // bv. fr => [ 'fr-products-1.xml', ... ]

const buildXml = (urls) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `<url><loc>${u}</loc></url>`).join('\n')}
</urlset>`;

const buildIndex = (files) => `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${files.map(f => `<sitemap><loc>https://sitemap.mykumi.com/${f}</loc></sitemap>`).join('\n')}
</sitemapindex>`;

const run = async () => {
  const indexRes = await fetch(INDEX_URL);
  const indexXml = await indexRes.text();
  const parsedIndex = await parseStringPromise(indexXml);
  const sitemapUrls = parsedIndex.sitemapindex.sitemap.map(s => s.loc[0]);

  for (const sitemapUrl of sitemapUrls) {
    try {
      const url = new URL(sitemapUrl);
      const path = url.pathname;
      const cleanPath = path.replace(/\?.*$/, '');

      // Match bv. /fr/sitemap_products_1.xml
      const match = cleanPath.match(/^\/(?:(fr|de|nl)\/)?sitemap_(products|pages|collections|blogs)_(\d+)/);
      if (!match) continue;

      const [, langMatch, type, chunk] = match;
      const lang = langMatch || 'en';
      const fileName = `${lang}-${type}-${chunk}.xml`;

      const res = await fetch(sitemapUrl);
      const xml = await res.text();

      if (!xml.includes('<urlset')) {
        console.warn(`⛔ Ongeldige sitemap bij ${sitemapUrl}`);
        continue;
      }

      const parsed = await parseStringPromise(xml);
      const urls = parsed.urlset?.url?.map(u => u.loc[0]) || [];

      if (!urls.length) {
        console.warn(`⚠️ Geen URLs in ${sitemapUrl}`);
        continue;
      }

      perFileContent[fileName] = buildXml(urls);
      perLangIndex[lang] = perLangIndex[lang] || [];
      perLangIndex[lang].push(fileName);

      console.log(`✅ ${fileName} (${urls.length} URLs)`);

    } catch (err) {
      console.warn(`⚠️ Fout bij ${sitemapUrl}: ${err.message}`);
    }
  }

  await fs.mkdir('dist', { recursive: true });

  // Vorige .xml-bestanden opruimen
  const existingFiles = await fs.readdir('dist');
  for (const file of existingFiles) {
    if (file.endsWith('.xml')) {
      await fs.unlink(`dist/${file}`);
    }
  }

  // Sitemap chunks wegschrijven
  for (const file in perFileContent) {
    await fs.writeFile(`dist/${file}`, perFileContent[file]);
  }

  // Index per taal (2 versies)
  for (const lang in perLangIndex) {
    perLangIndex[lang] = perLangIndex[lang].filter(f => f.endsWith('.xml'));

    const xml = buildIndex(perLangIndex[lang]);

    // Publieke versie
    await fs.writeFile(`dist/${lang}.xml`, xml);
    // Backupversie
    await fs.writeFile(`dist/${lang}-index.xml`, xml);

    console.log(`📦 ${lang}.xml en ${lang}-index.xml (${perLangIndex[lang].length} bestanden)`);
  }
};

run().catch(err => {
  console.error('❌ Script mislukt:', err);
  process.exit(1);
});
