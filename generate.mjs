// generate.mjs – gesplitst per taal én type
import fs from 'fs/promises';
import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';

const INDEX_URL = 'https://mykumi.com/sitemap.xml';
const LANGS = ['fr', 'de', 'nl']; // Engels = root

const perLangFiles = {}; // bv. fr -> [ 'fr-products-1.xml', ... ]
const perFileContent = {}; // bestandsnaam -> xml-string

const fetchAndParse = async (url) => {
  const res = await fetch(url);
  const text = await res.text();
  return parseStringPromise(text);
};

const buildXml = (urls) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `<url><loc>${u}</loc></url>`).join('\n')}
</urlset>`;

const buildIndex = (urls) => `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `<sitemap><loc>https://sitemap.mykumi.com/${u}</loc></sitemap>`).join('\n')}
</sitemapindex>`;

const run = async () => {
  const index = await fetchAndParse(INDEX_URL);
  const entries = index.sitemapindex.sitemap.map(s => s.loc[0]);

  for (const entry of entries) {
    const url = new URL(entry);
    const match = url.pathname.match(/^\/([a-z]{2})\/sitemap_(products|collections|pages|blogs)_([0-9]+)\.xml/);
    if (!match) continue;

    const [, lang, type, chunk] = match;

    const fileName = `${lang}-${type}-${chunk}.xml`;
    if (!LANGS.includes(lang)) continue;

    try {
      const parsed = await fetchAndParse(entry);
      const urls = parsed.urlset?.url?.map(u => u.loc[0]) || [];
      if (!urls.length) continue;

      // opslaan in per-bestand
      perFileContent[fileName] = buildXml(urls);

      // opslaan in per-taal index
      perLangFiles[lang] = perLangFiles[lang] || [];
      perLangFiles[lang].push(fileName);

      console.log(`✅ ${fileName} (${urls.length} URLs)`);

    } catch (err) {
      console.warn(`⚠️ Fout bij ${fileName}: ${err.message}`);
    }
  }

  await fs.mkdir('dist', { recursive: true });

  // Schrijf individuele taal-bestanden
  for (const file in perFileContent) {
    await fs.writeFile(`dist/${file}`, perFileContent[file]);
  }

  // Schrijf indexen per taal
  for (const lang in perLangFiles) {
    const indexXml = buildIndex(perLangFiles[lang]);
    await fs.writeFile(`dist/${lang}-index.xml`, indexXml);
    console.log(`📦 ${lang}-index.xml aangemaakt (${perLangFiles[lang].length} chunks)`);
  }
};

run().catch(e => {
  console.error('❌ Er ging iets mis:', e);
  process.exit(1);
});
