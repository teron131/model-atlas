# Model Atlas Coding Style

- Start scraper files with a multiline docblock whose first line says only what is scraped and from which source. After a blank `*` line, list the applicable source URLs. Do not describe ownership, preservation, normalization, crosswalks, or implementation history in the purpose sentence.

```ts
/**
 * <Description>.
 *
 * Page source: <url>
 * CSV source: <url>
 * JSON source: <url>
 */
```

- Match the format of existing scrapers.
- Keep only fields that are actually useful.
- Name benchmarks without the provider. Add the provider only when two sources would otherwise conflict.
- Use a provider-specific helper when benchmarks from that provider share the same row shape.
- Sort benchmark-related code alphabetically in most places. In UI and documentation that group benchmarks by missing-data class, put `frontier` before `baseline` and sort alphabetically within each group. Keep another order only when it has semantic meaning.
- Prefer optional chaining when it expresses the same check directly.
