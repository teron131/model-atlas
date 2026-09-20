/** Bundle Markdown and track its local illustrations so document edits participate in Fast Refresh. */

const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

/** Include artwork in the module revision so SVG-only edits invalidate the rendered document too. */
module.exports = function documentLoader(markdown) {
  const revision = createHash("sha256").update(markdown);
  const images = new Set(
    [
      ...markdown.matchAll(
        /!\[[^\n]*?\]\(((?:\.\.\/)?assets\/(?:methodology|matching|timeline|shared)\/[a-z0-9-]+\.svg)\)/g,
      ),
    ].map((match) => match[1]),
  );
  for (const image of images) {
    const path = resolve(dirname(this.resourcePath), image);
    this.addDependency(path);
    revision.update(readFileSync(path));
  }
  return `export default ${JSON.stringify({ markdown, revision: revision.digest("hex").slice(0, 16) })};`;
};
