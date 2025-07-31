// generate.mjs – versie met geforceerde overschrijving, maar zonder Git-force hack
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

      // Match bv. /fr/sitemap_products_1.xml → lang=fr, type=products, chunk=1
      const cleanPath = path.replace(/\?.*$/, '');
      const match = cleanPath.match(/^\/(?:(fr|de|nl)\/)?sitemap_(products|pages|collections|blogs)_(\d+)/);
      if (!match) continue;

      const [, langMatch, type, chunk] = match;
      const lang = langMatch || 'en';

      // ⛔ Filter: verwerk alleen gewenste talen
      if (!LANGS.includes(lang) && lang !== 'en') continue;

      const fileName = `${lang}-${type}-${chunk}.xml`;

      const res = await fetch(sitemapUrl);
      const xml = await res.text();
      const parsed = await parseStringPromise(xml);
      const urls = parsed.urlset?.url?.map(u => u.loc[0]) || [];

      // Als er echt niets in zit, skippen
      if (!urls.length) continue;

      perFileContent[fileName] = buildXml(urls);
      perLangIndex[lang] = perLangIndex[lang] || [];
      perLangIndex[lang].push(fileName);

      console.log(`✅ ${fileName} (${urls.length} URLs)`);

    } catch (err) {
      console.warn(`⚠️ Fout bij ${sitemapUrl}: ${err.message}`);
    }
  }

  await fs.mkdir('dist', { recursive: true });

  // 📝 Schrijf alle chunks weg
  for (const file in perFileContent) {
    await fs.writeFile(`dist/${file}`, perFileContent[file]);
  }

  // 🔄 Schrijf de indexen voor nl.xml, fr.xml enz.
  for (const lang in perLangIndex) {
    const entries = perLangIndex[lang].filter(f => f.endsWith('.xml'));
    const xml = buildIndex(entries);

    await fs.writeFile(`dist/${lang}.xml`, xml);         // bv. nl.xml
    await fs.writeFile(`dist/${lang}-index.xml`, xml);   // bv. nl-index.xml

    console.log(`📦 ${lang}.xml en ${lang}-index.xml (${entries.length} bestanden)`);
  }
};

run().catch(err => {
  console.error('❌ Script mislukt:', err);
  process.exit(1);
});
