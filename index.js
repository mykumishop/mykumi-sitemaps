export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, ''); // bijv. fr.xml

    // 🧾 Robots.txt response
    if (url.pathname === '/robots.txt') {
      return new Response(
        `User-agent: *\n` +
        `Sitemap: https://sitemap.mykumi.com/en.xml\n` +
        `Sitemap: https://sitemap.mykumi.com/fr.xml\n` +
        `Sitemap: https://sitemap.mykumi.com/de.xml\n` +
        `Sitemap: https://sitemap.mykumi.com/nl.xml\n`,
        { headers: { "Content-Type": "text/plain" } }
      );
    }

    try {
      const sitemap = await import(`./dist/${path}`, {
        with: { type: "text" }
      });
      return new Response(sitemap.default, {
        headers: { "Content-Type": "application/xml" },
      });
    } catch (e) {
      return new Response("Not found", { status: 404 });
    }
  },
};
