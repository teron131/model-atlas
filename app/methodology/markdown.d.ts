/** Markdown modules include a content revision covering their referenced local artwork. */

declare module "*.md" {
  const document: { markdown: string; revision: string };
  export default document;
}
