# llm-wiki-viewer

> **Wiki schema + project reference** — read at the start of every session together with `wiki/index.md`.

---

## Project overview

A zero-dependency local web viewer for wikis built with the `llm-wiki` Claude Code skill. Four files, no build step, no npm.

```bash
python server.py /path/to/wiki-root          # serve a wiki
python server.py /path/to/wiki-root --port 9000 --host 127.0.0.1 --no-open
```

Environment overrides: `LWV_PORT`, `LWV_HOST`, `LWV_WIKI_ROOT`.

## File structure

```
server.py      Python 3 stdlib HTTP server (no third-party deps)
index.html     SPA shell; loads CDN deps (marked, mermaid, KaTeX, highlight.js)
app.js         All frontend logic (~900 lines, vanilla JS, no framework)
style.css      CSS custom-property theming (light/dark), no preprocessor
.viewer.json   Optional per-wiki customization (title, tagline, brand, featured cards)
```

## Wiki root layout expected

```
WIKI_ROOT/
  wiki/          markdown content (concepts/, entities/, summaries/, index.md)
  audit/         feedback inbox written by the viewer
  CLAUDE.md      this file
  .viewer.json   viewer customization (optional)
```

## Server API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/welcome` | Title, tagline, brand, featured cards |
| GET | `/api/tree` | Full file tree of wiki/ as nested JSON |
| GET | `/api/page?path=<rel>` | Frontmatter + markdown body for a page |
| GET | `/api/resolve?name=<stem>` | Resolve a `[[wikilink]]` to a path |
| GET | `/api/search?q=<query>` | Full-text search, scored results |
| GET | `/api/backlinks?path=<rel>` | Pages that wikilink to the given path |
| GET | `/api/audits` | All audit files, newest first |
| GET | `/api/health` | Liveness + wiki_root info |
| POST | `/api/audit` | File a feedback record to audit/ |

## Frontend features

- Sidebar: collapsible folders (localStorage), search (Ctrl K) with highlighted snippets
- Rendering: marked.js + highlight.js (GitHub theme) + KaTeX + Mermaid
- Wikilinks: `[[Page Name]]` client-side resolution; broken links struck through
- Heading anchors: hover any heading to reveal a deep-link icon
- Back-links: "Linked from" chip list below each article
- Scroll memory: position saved/restored per page in localStorage
- Audit feedback: select text → "Add feedback" toolbar → modal → POST to `/api/audit`
- Feedback inbox: "inbox" in sidebar footer lists all audits; filter Open/All
- Theme: light/dark toggle with matching hljs CSS; mobile hamburger toggle

## Design constraints

- **Python stdlib only** — no pip install.
- **No build step** — CDN for all client deps.
- **No framework** — vanilla JS with flat `state` object and `els` DOM cache.
- **Path traversal safe** — `safe_join()` enforces file reads stay inside `PATHS.wiki`.

## .viewer.json schema

```json
{
  "title":   "My Wiki",
  "tagline": "One paragraph shown on welcome screen.",
  "brand":   "MW",
  "featured": [
    { "tag": "Start here", "title": "Index", "blurb": "...", "path": "index" }
  ]
}
```

---

## Wiki schema (llm-wiki skill)

**Scope**: architecture, APIs, frontend features, theming, audit/feedback system, configuration, and deployment of the llm-wiki-viewer tool itself.

**Excludes**: general web development concepts, the llm-wiki *skill* internals, Obsidian usage outside the viewer.

**Operations**: `compile`, `ingest`, `query`, `lint`, `audit` — each appends to `log/YYYYMMDD.md`.

## Naming conventions

- **Concept pages** (`wiki/concepts/`): Title Case noun phrases
- **Folder-split concepts**: used when a topic exceeds ~1200 words; `wiki/concepts/<topic>/index.md` + sub-pages
- **Entity pages** (`wiki/entities/`): proper tool/library names
- **Summary pages** (`wiki/summaries/`): kebab-case source slug

All pages: YAML frontmatter with `title`, `type`, `created`, `updated`, `tags`.
Diagrams: mermaid. Formulas: KaTeX. No ASCII art.

## Current articles

### Concepts
- [[wiki/concepts/Architecture]] — full system diagram; four-file layout; request lifecycle
- [[wiki/concepts/Server API]] — all nine endpoints with parameters and response shapes
- [[wiki/concepts/frontend/index|Frontend Features]] — overview of all client-side features
  - [[wiki/concepts/frontend/Rendering Pipeline]] — marked → hljs → KaTeX → mermaid
  - [[wiki/concepts/frontend/Sidebar Navigation]] — tree, search, collapsible folders, scroll memory
  - [[wiki/concepts/frontend/Audit Feedback System]] — select → toolbar → modal → audit/
  - [[wiki/concepts/frontend/Theming]] — CSS variables, light/dark, hljs sync
  - [[wiki/concepts/frontend/Mobile Support]] — hamburger, responsive layout
- [[wiki/concepts/Configuration]] — .viewer.json schema and auto-detection fallback
- [[wiki/concepts/Audit Feedback Workflow]] — end-to-end: filing → inbox → llm-wiki audit op

### Entities
- [[wiki/entities/marked.js]] — markdown renderer
- [[wiki/entities/highlight.js]] — syntax highlighter
- [[wiki/entities/Mermaid]] — diagram renderer
- [[wiki/entities/KaTeX]] — math renderer

### Summaries
*(none yet — ingest changelog entries, PR descriptions, or release notes as they accumulate)*

## Open research questions

- How does scroll-position restoration interact with anchor-hash navigation (`#section`)?
- What's the right approach for syntax highlighting inside mermaid labels?
- Should backlinks be cached server-side for large wikis (>500 pages)?

## Research gaps

- [ ] Performance profile on a large wiki (>200 pages) — tree load time, search latency
- [ ] Mobile UX patterns for sidebar-as-drawer vs. stacked-on-top

## Notes for the LLM

- Language: en
- Tone: technical, precise
- Depth: deep technical (implementation-level)
- When the source code changes: update the affected concept page(s) and bump `updated:` frontmatter
- Handling contradictions: note both, flag in Open Research Questions
