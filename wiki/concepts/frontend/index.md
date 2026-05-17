---
title: Frontend Features
type: concept
created: 2026-05-16
updated: 2026-05-16
tags: [frontend, javascript, spa]
---

# Frontend Features

The viewer's frontend is a vanilla-JS single-page application with no framework. All logic lives in `app.js` (~900 lines). DOM elements are cached in a top-level `els` object at startup; mutable state lives in a single `state` object.

## State object

```js
const state = {
  welcome, tree,           // loaded at init
  stemMap, pathSet,        // built from tree for wikilink resolution
  currentPath, currentRaw, // the loaded page
  pendingSelection,        // text selected for audit filing
  selectedSeverity,        // audit modal severity
  searchFocusIndex, searchResults, lastSearchQ,
  auditFilter,             // "open" | "all" for inbox filter
};
```

## Feature overview

```mermaid
mindmap
  root((app.js))
    Rendering
      marked.js markdown
      highlight.js code
      KaTeX math
      Mermaid diagrams
      Wikilink resolution
      Heading anchors
    Navigation
      URL-based ?p= routing
      Browser history pushState
      Scroll position memory
    Sidebar
      File tree
      Collapsible folders
      Full-text search
      Match highlighting
    Feedback
      Text selection toolbar
      Audit submission modal
      Feedback inbox modal
    UI
      Light/dark theme
      hljs CSS sync
      Mobile hamburger
      Back-links panel
```

## Sub-pages

- [[Rendering Pipeline]] — how markdown becomes HTML: preprocess → marked → hljs → KaTeX → mermaid → postprocess
- [[Sidebar Navigation]] — tree rendering, collapsible folders, search with snippet highlighting, scroll memory
- [[Audit Feedback System]] — selection detection, anchor extraction, modal, POST, inbox viewer
- [[Theming]] — CSS custom properties, dark/light toggle, highlight.js CSS swapping
- [[Mobile Support]] — hamburger toggle, sidebar drawer pattern, responsive breakpoint

## Initialization sequence

```mermaid
sequenceDiagram
    participant D as DOMContentLoaded
    participant I as init()
    participant W as loadWelcome()
    participant T as loadTree()
    participant P as loadPage()

    D->>I: fires
    I->>I: initTheme() + syncHljsTheme()
    I->>I: wire all event listeners
    I->>W: fetch /api/welcome
    I->>T: fetch /api/tree (parallel with welcome)
    W-->>I: sets title, brand, featured cards
    T-->>I: builds stemMap + pathSet, renders tree
    I->>P: if ?p= param in URL
    P-->>I: renders page + loads backlinks
```
