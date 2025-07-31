export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, ''); // bijv. fr.xml

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
