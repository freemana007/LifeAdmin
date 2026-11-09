// Packs the demo build into one self-contained HTML page for publishing as a
// claude.ai artifact (the artifact host wraps it in its own <html>/<head>).
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "dist-demo";
const assets = readdirSync(join(dir, "assets"));
const js = assets.filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(dir, "assets", f), "utf8")).join("\n");
const css = assets.filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(dir, "assets", f), "utf8")).join("\n");

if (/<!--/.test(js)) console.warn("warning: '<!--' in bundle may confuse the HTML parser");
const safeJs = js.replace(/<\/script/gi, "<\\/script");

const html = `<title>Life Admin</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Snap a letter or paste an email: plain-English summary, deadlines on one timeline, and drafts to act on them.">
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${safeJs}
</script>
`;
writeFileSync(join(dir, "life-admin.html"), html);
// Free time listings: a dated snapshot of the open data, published next to the page as freetime.json.
copyFileSync(new URL("../../server/data/freetime-snapshot.json", import.meta.url), join(dir, "freetime.json"));
console.log(`wrote ${dir}/life-admin.html (${(html.length / 1024).toFixed(0)} KB)`);
