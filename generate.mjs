import fs from 'fs/promises';
import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';

const INDEX_URL = 'https://mykumi.com/sitemap.xml';
const LANGS = ['fr', 'de', 'nl']; // Engels = root
const output = {};  // bv. output['fr-products-1'] = [ ... ]
const perLangIndex = {}; // bv. perLangIndex['fr'] = [ 'fr-products-1.xml', ... ]

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
      const res = await fetch(sitemapUrl);
      const xml = await res.text();
      const parsed = await parseStringPromise(xml);
      const urls = parsed.urlset?.url?.map(u => u.loc[0]) || [];

      for (const lang of [...LANGS, 'en']) {
        const filtered = urls.filter(url => {
          const path = new URL(url).pathname;
          return lang === 'en'
            ? !LANGS.some(l => path.startsWith(`/${l}/`)) // Engels = alles zonder taalslug
            : path.startsWith(`/${lang}/`);
        });

        if (filtered.length === 0) continue;

        // Bestandsnaam bepalen op basis van originele sitemapUrl
        const typeMatch = sitemapUrl.match(/sitemap_(products|pages|collections|blogs)/);
        const type = typeMatch?.[1] || 'unknown';
        const chunkMatch = sitemapUrl.match(/_(\d+)\.xml/);
        const chunk = chunkMatch?.[1] || '0';

        const filename = `${lang}-${type}-${chunk}.xml`;

        output[filename] = buildXml(filtered);
        perLangIndex[lang] = perLangIndex[lang] || [];
        perLangIndex[lang].push(filename);

        console.log(`✅ ${filename} (${filtered.length} URLs)`);
      }
    } catch (err) {
      console.warn(`⚠️ Fout bij ${sitemapUrl}: ${err.message}`);
    }
  }

  await fs.mkdir('dist', { recursive: true });

  // Schrijf individuele .xml-bestanden
  for (const file in output) {
    await fs.writeFile(`dist/${file}`, output[file]);
  }

  // Schrijf per-taal index.xml
  for (const lang in perLangIndex) {
    const index = buildIndex(perLangIndex[lang]);
    await fs.writeFile(`dist/${lang}-index.xml`, index);
    console.log(`📦 ${lang}-index.xml (${perLangIndex[lang].length} chunks)`);
  }
};

run().catch(e => {
  console.error('❌ Er ging iets mis:', e);
  process.exit(1);
});
