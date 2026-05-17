---
title: Server API
type: concept
created: 2026-05-16
updated: 2026-05-16
tags: [server, api, endpoints, python]
---

# Server API

`server.py` exposes nine HTTP routes — eight GET and one POST — all under `/api/`. Static assets (`index.html`, `app.js`, `style.css`) are served from the script's own directory.

## Endpoint reference

### `GET /api/welcome`

Returns metadata for the welcome screen, derived from `wiki/index.md` and optionally overridden by `.viewer.json`.

**Response shape:**
```json
{
  "title":    "My Wiki",
  "tagline":  "One paragraph description.",
  "brand":    "MW",
  "featured": [
    { "tag": "Start here", "title": "Index", "blurb": "...", "path": "index" }
  ]
}
```

Auto-detection: `title` comes from the `# H1` in `index.md` (stripping `"Index — "` prefix); `tagline` from the first blockquote. `.viewer.json` overrides win.

---

### `GET /api/tree`

Full file tree of `wiki/`, as a nested JSON structure. Folders before files at each level; files sorted alphabetically.

**Response shape:**
```json
{
  "name": "wiki", "path": "", "is_file": false,
  "children": [
    { "name": "index", "filename": "index", "path": "index", "is_file": true },
    { "name": "concepts", "path": "concepts", "is_file": false,
      "children": [ ... ] }
  ]
}
```

Titles are read from the `title` frontmatter field (first 400 bytes scanned). Directories beginning with `.` are skipped.

---

### `GET /api/page?path=<rel>`

Returns the full content of a page. `rel` is the path relative to `wiki/`, without `.md` extension.

**Response shape:**
```json
{
  "path":        "concepts/Architecture",
  "title":       "Architecture",
  "frontmatter": { "type": "concept", "tags": ["architecture"] },
  "markdown":    "# Architecture\n...",
  "raw":         "---\ntitle: Architecture\n---\n# Architecture\n..."
}
```

`markdown` is the body after the frontmatter block is stripped. `raw` is the full file content (used by the audit anchor-matching logic).

---

### `GET /api/resolve?name=<stem>`

Resolves a `[[wikilink]]` target to a path. Matches in order: exact path, stem, then the last path component.

**Response shape:**
```json
{ "found": true, "path": "concepts/Architecture", "ambiguous": false }
```

If ambiguous (same stem in multiple folders): `"ambiguous": true, "candidates": [...]`.

---

### `GET /api/search?q=<query>`

Full-text search across all `.md` files in `wiki/`. Scores: +10 for match in filename, +3 for match in body. Returns up to 25 results sorted by score descending.

**Response shape:**
```json
[
  { "path": "concepts/Architecture", "title": "Architecture",
    "snippet": "...request lifecycle...", "score": 13 }
]
```

---

### `GET /api/backlinks?path=<rel>`

Scans all wiki pages for `[[wikilinks]]` pointing to `rel`. Matching: exact path match OR stem match OR last-component match — mirrors `resolveLink()` in `app.js`.

**Response shape:**
```json
[
  { "path": "concepts/Server API", "title": "Server API" }
]
```

Results are sorted alphabetically by title. Self-links are excluded.

---

### `GET /api/audits`

Lists all `audit/*.md` files, newest first (sorted by filename, which is timestamp-prefixed). Parses frontmatter and extracts the first non-empty line under the `# Comment` heading.

**Response shape:**
```json
[
  {
    "id":          "20260516-143022-a1b2",
    "target":      "wiki/concepts/Architecture.md",
    "severity":    "warn",
    "author":      "justin",
    "created":     "2026-05-16T14:30:22+00:00",
    "status":      "open",
    "anchor_text": "ThreadingHTTPServer",
    "comment":     "Should mention the GIL caveat for CPU-bound ops."
  }
]
```

---

### `GET /api/health`

Liveness check.

```json
{ "ok": true, "wiki_root": "/path/to/wiki", "wiki_exists": true }
```

---

### `POST /api/audit`

Files a feedback record. Validates required fields and that `anchor_text` exists in the target file, then writes a structured markdown file to `audit/`.

**Request body:**
```json
{
  "target":        "concepts/Architecture",
  "anchor_text":   "ThreadingHTTPServer",
  "anchor_before": "...60 chars before...",
  "anchor_after":  "...60 chars after...",
  "severity":      "warn",
  "author":        "justin",
  "comment":       "Should mention the GIL caveat."
}
```

Valid severities: `info`, `suggest`, `warn`, `error`.

**Success response:** `{ "ok": true, "id": "20260516-143022-a1b2", "path": "audit/20260516-143022-..." }`

The written file uses JSON-encoded strings for `anchor_*` and `author` fields (via `json.dumps`) to safely encode any whitespace or quotes.

## Internal helpers

| Function | Purpose |
|----------|---------|
| `safe_join(base, rel)` | Path traversal guard — returns `None` if resolved path escapes `base` |
| `parse_frontmatter(text)` | Strips YAML block, returns `(dict, body)` |
| `build_stem_map()` | Builds `{stem → [paths]}` and `{all paths}` by walking `wiki/` |
| `WIKILINK_RE` | `r"\[\[([^\]|#]+)(?:#...)(?:\|...)?\]\]"` — captures link target only |

See [[Architecture]] for the threading model and path-safety details.
