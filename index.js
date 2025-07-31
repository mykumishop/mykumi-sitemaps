export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, ''); // bijv. fr.xml

    // Robots.txt response
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
      const response = await fetch(`https://raw.githubusercontent.com/mykumishop/mykumi-sitemaps/main/dist/${path}`);
      if (response.status === 200) {
        return new Response(await response.text(), {
          headers: { "Content-Type": "application/xml" }
        });
      } else {
        return new Response("Not found", { status: 404 });
      }
    } catch (e) {
      return new Response("Error loading file", { status: 500 });
    }
  },
};
