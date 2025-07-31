import fs from 'fs/promises';
import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';

const SOURCE_URL = 'https://mykumi.com/sitemap.xml';
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
  const res = await fetch(SOURCE_URL);
  const xml = await res.text();
  const parsed = await parseStringPromise(xml);

  const urls = parsed.urlset.url.map(u => u.loc[0]);

  for (const url of urls) {
    const path = new URL(url).pathname;

    const matchedLang = LANGS.find(lang => path.startsWith(`/${lang}/`));
    if (matchedLang) {
      outputPerLang[matchedLang].push(url);
    } else {
      outputPerLang.en.push(url); // Engels = root
    }
  }

  for (const lang in outputPerLang) {
    const out = buildXml(outputPerLang[lang]);
    await fs.writeFile(`dist/${lang}.xml`, out.trim());
    console.log(`✅ ${lang}.xml geschreven (${outputPerLang[lang].length} URLs)`);
  }
};

run();
