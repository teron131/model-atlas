# Backend sources

`src/model-atlas/sources` owns external data acquisition, source normalization, raw-cache reconstruction, and source refresh policy.
Source-specific collaborators live together so a leaderboard format change can be implemented and verified beside its parser.

## Ownership

| Area | Owns |
| --- | --- |
| `benchmarks/catalog` | Benchmark selection, source declarations, scoring roles, transforms, resource policy, and presentation metadata. |
| `sources/<source>` | Source parsing, source-specific cache acceptance, raw serialization, and source-specific snapshot behavior. |
| `sources/observations` | Catalog-loader dispatch and the shared benchmark-observation cache lifecycle. |
| `sources/benchmarks.ts` | Membership and orchestration for sources with custom raw-row contracts. |
| `sources/assembly` | Complete source-row assembly and matching lookups shared by live and cached inputs. |
| `sources/snapshots` | Shared refresh, fallback, quarantine, and reconstruction rules. |
| `sources/cache` | Shared SQLite cache-row decoding and freshness status. |
| `database` | Schema reconciliation, checkpoint transactions, derived-row persistence, audit history, and GCS publication. |
| `pipeline` | Model derivation, benchmark assignment, and scoring. |

## Updating a source

Start with the existing source owner and its parser fixtures.
Shared publishers such as Epoch, Surge, Vals, and Artificial Analysis retain shared parsers for their common external formats.
Benchmarks with custom raw records keep their leaderboard and runtime together, such as `sources/cursorbench/leaderboard.ts` and `sources/cursorbench/runtime.ts`.

OpenRouter's shared response and source contracts live in `sources/openrouter/types.ts`, with normalization in `stats.ts`, fetching in `workflow.ts`, and persistence in `cache.ts` and `write.ts`.
`OpenRouterSourcePayload` contains selected source evidence, `OpenRouterPerformance` distinguishes summaries from histories, and `OpenRouterSeriesResponse` describes the upstream series shape.
Keep upstream latency histories in milliseconds and normalized latency summaries in seconds.
Each refresh shares requests for aliases of the same route; the request cache ends with the refresh and failed candidates remain retryable.

A standard benchmark's catalog binding resolves through `benchmarkObservationSource` to its fetch operation and optional cache-acceptance rule.
Put task-version, harness, eligibility, and resource-shape checks beside the parser, and attach them through that binding.
The shared observation cache owns SQL decoding, timestamps, row identity, and source-preservation mechanics.

A custom runtime owns its cache key, source identity, table binding, cache reader, snapshot operation, writer, live-row loader, and cached-row projection.
`defineBenchmarkRuntime` binds each runtime to its own cache shape before the registry combines heterogeneous sources.
The registry lists source membership and retains its intentional execution order; source-specific loading recipes belong in the runtime.

Keep custom benchmark provenance URLs beside their leaderboard implementation so cache readers and writers use the same source location.
Changing a persisted row shape still requires an explicit schema and codec change, with all affected readers and writers migrated together.
Retain raw configuration, effort, harness, eligibility, and provenance distinctions when the shared observation contract cannot express them faithfully.

## Ordering and verification

Preserve existing schema columns, type members, object fields, SQL parameter positions, and serialized field order.
For new records, put identity and discriminators first, then group related data by purpose.
Place file-wide prerequisites before public workflows, then secondary public operations and private helpers in reading order.
Runtime descriptors precede their implementation helpers; ordinary `index.ts` files remain export-only.

Verify parser fixtures, cache round trips, stale-cache rejection, missing-source preservation, and benchmark assignment for the affected source.
For structural changes, compare ordered source reconstruction, derived models, and public payloads using fixed time and cached inputs, then run the full test suite, typecheck, lint, formatting checks, and build.
Schema and persisted-output equivalence are separate checks from compilation.
