# Catalog and verification decisions

> 日本語版は [catalog.ja.md](catalog.ja.md) を参照してください.

Closed decisions about what the catalog lists and how its rows are verified. The rules in force are in [CLAUDE.md](../../CLAUDE.md) "Product catalog / data updates", the skills under `.claude/skills/` and [tools/verify/README.md](../../tools/verify/README.md); this document holds the decisions behind them and points to the pull requests that record them.

## What the catalog lists

The scope is in CLAUDE.md "Product catalog / data updates" and in "Scope" of the discover-products skill. The decisions on particular product groups, brands and models are recorded in the pull requests of the catalog audits:

- [#7](https://github.com/semnil/audio-interface-compare-site/pull/7) (2026-07) — "Catalog policy decisions"
- [#56](https://github.com/semnil/audio-interface-compare-site/pull/56) (2026-10) — the products deferred or left out
- [#84](https://github.com/semnil/audio-interface-compare-site/pull/84) (2026-11) — the products not listed

Decided outside those pull requests: Radial SW8-USB and USB-Pro take USB audio for playback only, so they are not listed (2026-11-05).

## Stage 2 of the verification keeps its own fetch ladder

- **Decision** (2026-09-30): the stage 2 prompt (`tools/verify/recheck-workflow.js`) keeps its ladder — WebFetch, curl, headless Chrome `--dump-dom`, and the Wayback Machine copy of the same official URL when every official site fails. It does not take the rungs `c2` to `c4` of stage 1 (`tools/verify/workflow.js`: the reader proxy, the direct fetch of official PDFs and the screenshot). The difference between the two stages is not a gap to close.
- **Background**: decided when [#55](https://github.com/semnil/audio-interface-compare-site/pull/55) settled how the output of the reader proxy is treated in stage 1.

## Row decisions of the catalog audits

The counting rules are in "Cell format conventions" of the verify-products skill. The decisions on particular rows, with the official sources behind them, are in the pull requests that changed the rows:

- [#56](https://github.com/semnil/audio-interface-compare-site/pull/56), [#57](https://github.com/semnil/audio-interface-compare-site/pull/57), [#58](https://github.com/semnil/audio-interface-compare-site/pull/58) (2026-10)
- [#84](https://github.com/semnil/audio-interface-compare-site/pull/84), [#85](https://github.com/semnil/audio-interface-compare-site/pull/85), [#86](https://github.com/semnil/audio-interface-compare-site/pull/86), [#87](https://github.com/semnil/audio-interface-compare-site/pull/87), [#88](https://github.com/semnil/audio-interface-compare-site/pull/88) (2026-11)
