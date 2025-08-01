// generate.mjs v5 – volledige validatie per taal vóór commit
import fs from 'fs/promises';
import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';

const INDEX_URL = 'https://mykumi.com/sitemap.xml';
const LANGS = ['en', 'fr', 'de', 'nl'];

const perFileContent = {}; // bv. fr-products-1.xml => inhoud
const perLangIndex = {};   // bv. fr => [bestandsnamen]

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

  const byLang = {
    en: [], fr: [], de: [], nl: []
  };

  for (const url of sitemapUrls) {
    const path = new URL(url).pathname.replace(/\?.*$/, '');
    const match = path.match(/^\/(?:(fr|de|nl)\/)?sitemap_(products|pages|collections|blogs)_(\d+)/);
    if (!match) continue;

    const [, lang = 'en'] = match;
    if (!byLang[lang]) byLang[lang] = [];
    byLang[lang].push(url);
  }

  for (const lang of LANGS) {
    const urls = byLang[lang] || [];
    for (const sitemapUrl of urls) {
      try {
        const path = new URL(sitemapUrl).pathname.replace(/\?.*$/, '');
        const match = path.match(/^\/(?:(fr|de|nl)\/)?sitemap_(products|pages|collections|blogs)_(\d+)/);
        if (!match) continue;

        const [, , type, chunk] = match;
        const fileName = `${lang}-${type}-${chunk}.xml`;

        const res = await fetch(sitemapUrl);
        const xml = await res.text();
        const parsed = await parseStringPromise(xml);
        const entries = parsed.urlset?.url?.map(u => u.loc[0]) || [];

        if (!entries.length) continue;

        perFileContent[fileName] = buildXml(entries);
        perLangIndex[lang] = perLangIndex[lang] || [];
        perLangIndex[lang].push(fileName);

        console.log(`✅ ${fileName} (${entries.length} URLs)`);
      } catch (err) {
        console.warn(`⚠️ Fout bij ${sitemapUrl}: ${err.message}`);
      }
    }
  }

  // ✅ Validatie: elke taal moet exact zelfde structuur hebben als 'en'
  const structure = {};
  for (const lang of LANGS) {
    const counts = { products: 0, pages: 0, collections: 0, blogs: 0 };
    for (const file of perLangIndex[lang] || []) {
      const match = file.match(/-(products|pages|collections|blogs)-/);
      if (match) counts[match[1]]++;
    }
    structure[lang] = counts;
  }

  const reference = structure.en;
  let valid = true;
  for (const lang of LANGS) {
    for (const type of ['products', 'pages', 'collections', 'blogs']) {
      if ((structure[lang]?.[type] || 0) !== (reference[type] || 0)) {
        console.error(`❌ ${lang} heeft ${structure[lang][type]} ${type}, verwacht ${reference[type]}`);
        valid = false;
      }
    }
  }

  if (!valid) {
    console.error('❌ Sitemapstructuur ongeldig. Run wordt gestopt zonder wegschrijven.');
    process.exit(1);
  }

  await fs.mkdir('dist', { recursive: true });
  const files = await fs.readdir('dist');
  for (const file of files) {
    if (file.endsWith('.xml')) {
      await fs.unlink(`dist/${file}`);
    }
  }

  for (const file in perFileContent) {
    await fs.writeFile(`dist/${file}`, perFileContent[file]);
  }

  for (const lang of LANGS) {
    const files = (perLangIndex[lang] || []).filter(f => f.endsWith('.xml'));
    const indexXml = buildIndex(files);
    await fs.writeFile(`dist/${lang}.xml`, indexXml);
    await fs.writeFile(`dist/${lang}-index.xml`, indexXml);
    console.log(`📦 ${lang}.xml (${files.length} bestanden)`);
  }
};

run().catch(err => {
  console.error('❌ Script mislukt:', err);
  process.exit(1);
});
