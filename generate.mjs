import fs from 'fs/promises';
import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';

const INDEX_URL = 'https://mykumi.com/sitemap.xml';
const LANGS = ['fr', 'de', 'nl']; // 'en' is zonder prefix

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

const run = async () => {
  const indexRes = await fetch(INDEX_URL);
  const indexXml = await indexRes.text();
  const parsedIndex = await parseStringPromise(indexXml);
  const sitemapUrls = parsedIndex.sitemapindex.sitemap.map(s => s.loc[0]);

  console.log(`📦 Shopify-sitemap bevat ${sitemapUrls.length} chunks`);

  for (const sitemapUrl of sitemapUrls) {
    try {
      const url = new URL(sitemapUrl);
      const cleanPath = url.pathname; // zonder querystring

      const match = cleanPath.match(/^\/(?:(fr|de|nl)\/)?sitemap_(products|pages|collections|blogs)_(\d+)\.xml$/i);
      if (!match) {
        console.log(`⏭️  Overgeslagen (geen match): ${cleanPath}`);
        continue;
      }

      const [, langMatch, type, chunk] = match;
      const lang = langMatch || 'en';
      const fileName = `${lang}-${type}-${chunk}.xml`;

      const res = await fetch(sitemapUrl);
      const xml = await res.text();
      const parsed = await parseStringPromise(xml);
      const urls = parsed.urlset?.url?.map(u => u.loc[0]) || [];

      if (!urls.length) {
        console.log(`⚠️ Lege sitemap: ${fileName}`);
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

  // Verwijder oude .xml bestanden
  const files = await fs.readdir('dist');
  for (const file of files) {
    if (file.endsWith('.xml')) {
      await fs.unlink(`dist/${file}`);
    }
  }

  // Wegschrijven chunks
  for (const file in perFileContent) {
    await fs.writeFile(`dist/${file}`, perFileContent[file]);
  }

  // Wegschrijven indexen
  for (const lang in perLangIndex) {
    const files = perLangIndex[lang].filter(f => f.endsWith('.xml'));
    const index = buildIndex(files);
    await fs.writeFile(`dist/${lang}.xml`, index);
    await fs.writeFile(`dist/${lang}-index.xml`, index);
    console.log(`📑 ${lang}.xml bevat ${files.length} chunks`);
  }
};

run().catch(err => {
  console.error('❌ Script mislukt:', err);
  process.exit(1);
});
