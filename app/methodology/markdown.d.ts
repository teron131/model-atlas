/** Markdown modules include a content hash covering their referenced local artwork. */

declare module "*.md" {
  const document: { markdown: string; hash: string };
  export default document;
}
