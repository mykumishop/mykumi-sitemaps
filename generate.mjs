import fs from "node:fs/promises";

const langs = [
  { code: "en", slug: "/", hostname: "https://mykumi.com" },
  { code: "fr", slug: "/fr/", hostname: "https://mykumi.com" },
  { code: "de", slug: "/de/", hostname: "https://mykumi.com" },
  { code: "nl", slug: "/nl/", hostname: "https://mykumi.com" },
];

const SITEMAP_URL = "https://mykumi.com/sitemap.xml";

async function fetchXml(url, agent) {
  const res = await fetch(url, {
    headers: {
      "user-agent": agent
    }
  });
  return res.text();
}

function extractEntries(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
}

function wrapSitemap(urls) {
  const body = urls.map(u => `<url><loc>${u}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}

function wrapIndex(sitemaps) {
  const body = sitemaps.map(u => `<sitemap><loc>${u}</loc></sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>`;
}

async function main() {
  const xml = await fetchXml(SITEMAP_URL, "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
  const urls = extractEntries(xml);

  const result = {};

  for (const lang of langs) {
    const match = urls.filter(u => {
      return lang.slug === "/"
        ? !u.includes("/fr/") && !u.includes("/de/") && !u.includes("/nl/")
        : u.includes(lang.slug);
    });

    result[lang.code] = match.map(u => (u.startsWith("http") ? u : lang.hostname + u));
  }

  await fs.mkdir("dist", { recursive: true });

  const sitemapFiles = [];

  for (const lang of langs) {
    const output = wrapSitemap(result[lang.code]);
    const filename = `sitemap-${lang.code}.xml`;
    sitemapFiles.push(lang.hostname + "/" + filename);
    await fs.writeFile("dist/" + filename, output);
  }

  await fs.writeFile("dist/sitemap.xml", wrapIndex(sitemapFiles));
}

main();
