---
title: Index — llm-wiki-viewer
type: index
created: 2026-05-16
updated: 2026-05-16
---

# Index — llm-wiki-viewer

> A zero-dependency local web viewer for llm-wiki-skill wikis — Python stdlib server, vanilla JS SPA, four files, no build step.

## 🔖 Navigation
- [[#Concepts]] · [[#Entities]] · [[#Open Questions]]

## Concepts

### Architecture & Server
- [[concepts/Architecture]] — system diagram, four-file layout, request lifecycle, path safety, threading model
- [[concepts/Server API]] — all nine `/api/*` endpoints: welcome, tree, page, resolve, search, backlinks, audits, health, audit POST

### Frontend
- [[concepts/frontend/index|Frontend Features]] — state object, feature overview, initialization sequence
    - [[concepts/frontend/Rendering Pipeline]] — preprocess → marked → hljs → KaTeX → mermaid → postprocess
    - [[concepts/frontend/Sidebar Navigation]] — collapsible folders, search + highlighting, scroll memory, footer
    - [[concepts/frontend/Audit Feedback System]] — selection detection, anchor extraction, modal, POST, inbox viewer
    - [[concepts/frontend/Theming]] — CSS custom properties, dark/light toggle, hljs CSS swapping
    - [[concepts/frontend/Mobile Support]] — hamburger toggle, sidebar drawer, responsive breakpoint

### Configuration & Workflows
- [[concepts/Configuration]] — `.viewer.json` schema, server CLI args, auto-detection fallback
- [[concepts/Audit Feedback Workflow]] — filing → inbox → llm-wiki audit op → resolved/

## Entities

- [[entities/marked.js]] — markdown renderer (CDN, v12.0.2)
- [[entities/highlight.js]] — syntax highlighter (CDN, v11.9.0); GitHub light/dark themes
- [[entities/Mermaid]] — diagram renderer (CDN, v10.9.1); theme-synced SVG output
- [[entities/KaTeX]] — math renderer (CDN, v0.16.11); `$...$` and `$$...$$`

## Summaries (chronological)

*(none yet — ingest changelog entries or release notes as the project evolves)*

## Open Questions

- How does scroll-position restoration interact with anchor-hash navigation (`?p=path#section`)? Currently `restoreScrollPos` may overwrite an intended anchor jump.
- Should backlinks be cached/indexed server-side for wikis with >500 pages? Current implementation re-scans all files on every request.
- What's the right approach for syntax highlighting inside mermaid node labels?
