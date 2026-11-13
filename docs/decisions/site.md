# Site decisions

> 日本語版は [site.ja.md](site.ja.md) を参照してください.

Closed decisions about the site and its documents, with the alternatives that were turned down. What the site does today is in [AGENTS.md](../../AGENTS.md); this document holds why it has that shape. The decision to render comparisons in the browser and to give up search traffic for comparison queries is in AGENTS.md "SEO policy (making the comparison pages dynamic, 2026-07)".

## The og share cards are written as JPEG

- **Decision** (2026-11-04): the share cards keep their gradient background and are encoded as JPEG at quality 90 ([#82](https://github.com/semnil/audio-interface-compare-site/pull/82)).
- **Reason**: after an update of @napi-rs/canvas the gradient is dithered, PNG does not compress the dither, and the library's PNG encoder takes no compression setting. The card sizes before and after are in #82.
- **Alternatives turned down**: a flat-colour background kept as PNG; WebP, because the official documents of the services that show the cards did not confirm support for it; pinning @napi-rs/canvas to the older version.

## /ja/ pages show a notice and do not redirect

- **Decision** (2026-11-06): a `/ja/` page opened with no saved language choice and a browser language other than Japanese shows a notice with a link to the English page, and stays on `/ja/` ([#94](https://github.com/semnil/audio-interface-compare-site/pull/94)). CLAUDE.md states this behaviour as it is and declares no override of a convention for it.
- **Reason**: Googlebot renders `/ja/` with an English browser language, so a redirect there would send it away from the pages it should index (CLAUDE.md "Multilingual (/ja/ + hreflang)").
- **Alternatives turned down**: adding nothing to `/ja/` pages; redirecting `/ja/` to the English page automatically.
- **Background**: an English fallback on the `/ja/` side was one of the items chosen for implementation on 2026-10-17 (the section "CLAUDE.md follows the global conventions" below), and it contradicted the rule that `/ja/` does not redirect. The three forms above were the choices that resolved it.
- **Accepted cost**: Safari, Firefox and real phones were not tried, and the decision of 2026-11-06 is to leave it so. What was tried in Chrome is in #94.

## Dark mode follows the system setting

Decided and recorded in [#91](https://github.com/semnil/audio-interface-compare-site/pull/91), including the one kind of element left below WCAG AA on purpose (the `/` between measurement links, kept as a decorative separator).

## CLAUDE.md follows the global conventions

- **Decision** (2026-10-17): where CLAUDE.md contradicted the operator's global conventions, the conventions win, and CLAUDE.md declares an override only where this repository differs on purpose ([#59](https://github.com/semnil/audio-interface-compare-site/pull/59)).
- **Overrides declared**: the dependencies exceljs and @napi-rs/canvas, and citing measurement data within review sites in the Measurement Reports column.
- **Alternatives turned down**: for the measurement sources, removing those sources from the collect-measurements skill, which would have covered most of the links already in the column.
- **Decision** (2026-10-17): the items that were open at the time — matching the xlsx header row, highlighting THD+N and EIN, dark mode, an English fallback on `/ja/`, exporting the helpers the tests use — are implemented, so that the code follows the conventions. This was finished on 2026-11-06 ([#89](https://github.com/semnil/audio-interface-compare-site/pull/89), [#90](https://github.com/semnil/audio-interface-compare-site/pull/90), [#91](https://github.com/semnil/audio-interface-compare-site/pull/91), [#94](https://github.com/semnil/audio-interface-compare-site/pull/94)).
- **Alternatives turned down**: declaring an override for each item; writing each one into CLAUDE.md as something the site does not provide.

## English is the base language of the documents

- **Decision** (2026-10-20): documents are written in English with a Japanese counterpart beside them, and CLAUDE.md and the skills are English only ([#63](https://github.com/semnil/audio-interface-compare-site/pull/63); the rule itself is the override line in CLAUDE.md "Project overview"). The titles and bodies of the pull requests merged before that day were translated as well.
- **Decision** (2026-10-20): issue [#8](https://github.com/semnil/audio-interface-compare-site/issues/8), the contact route that needs no GitHub account, stays written in both languages in one issue.
- **Japanese kept on purpose**: the lists are in [#65](https://github.com/semnil/audio-interface-compare-site/pull/65) (the product strings of `/ja/`, and the Japanese the tests compare with `/ja/` output or pass in as input) and [#66](https://github.com/semnil/audio-interface-compare-site/pull/66) (the markers `validate-results.js` looks for in the notes of existing results, and a quoted discontinuation notice).
