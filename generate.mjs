// generate.mjs v7.2 – statisch + retry + live-sitemap.xml + validering
import fs from 'fs/promises';
import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';

const INDEX_URL = 'https://mykumi.com/sitemap.xml';
const LANGS = ['en', 'fr', 'de', 'nl'];

const perFileContent = {};
const perLangIndex = {};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url, retries = 4) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      return await parseStringPromise(text);
    } catch (err) {
      console.warn(`⏳ Retry ${attempt} voor ${url} mislukt: ${err.message}`);
      if (attempt < retries) await sleep(1000);
    }
  }
  throw new Error(`🚫 Permanente fout bij ophalen van ${url}`);
};

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

  const byLang = { en: [], fr: [], de: [], nl: [] };

  for (const url of sitemapUrls) {
    const path = new URL(url).pathname.replace(/\?.*$/, '');
    const match = path.match(/^\/(?:(fr|de|nl)\/)?sitemap_(products|pages|collections|blogs)_(\d+)/);
    if (!match) continue;
    const [, lang = 'en'] = match;
    byLang[lang].push(url);
  }

  for (const lang of LANGS) {
    const urls = byLang[lang] || [];
    console.log(`🌍 Verwerking ${lang.toUpperCase()} (${urls.length} sitemaps)`);

    for (const sitemapUrl of urls) {
      const path = new URL(sitemapUrl).pathname.replace(/\?.*$/, '');
      const match = path.match(/^\/(?:(fr|de|nl)\/)?sitemap_(products|pages|collections|blogs)_(\d+)/);
      if (!match) continue;

      const [, , type, chunk] = match;
      const fileName = `${lang}-${type}-${chunk}.xml`;

      try {
        const parsed = await fetchWithRetry(sitemapUrl);
        const entries = parsed.urlset?.url?.map(u => u.loc[0]) || [];
        if (!entries.length) {
          console.warn(`⚠️ Lege sitemap: ${fileName}`);
          continue;
        }

        perFileContent[fileName] = buildXml(entries);
        perLangIndex[lang] = perLangIndex[lang] || [];
        perLangIndex[lang].push(fileName);

        console.log(`✅ ${fileName} (${entries.length} URLs)`);
      } catch (err) {
        console.warn(`❌ Overgeslagen: ${fileName} – ${err.message}`);
      }

      await sleep(600);
    }
  }

  // ✅ Valideren op gelijke structuur
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
    console.error('🚫 Ongeldige structuur. Geen bestanden geschreven.');
    process.exit(1);
  }

  // ✅ Schrijven naar dist/
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
    console.log(`📦 ${lang}.xml en ${lang}-index.xml (${files.length} chunks)`);
  }

  // ✅ live-sitemap.xml met indexlinks
  const allIndexes = LANGS.map(lang => `${lang}.xml`);
  const liveXml = buildIndex(allIndexes);
  await fs.writeFile(`dist/live-sitemap.xml`, liveXml);
  console.log(`🌐 live-sitemap.xml aangemaakt (${allIndexes.length} taalindexen)`);
};

run().catch(err => {
  console.error('❌ Script mislukt:', err);
  process.exit(1);
});
