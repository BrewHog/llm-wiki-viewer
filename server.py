#!/usr/bin/env python3
"""
llm-wiki-viewer / server.py
A self-updating local web viewer for any wiki created with the llm-wiki skill.

USAGE
    python server.py [WIKI_ROOT] [--port PORT] [--host HOST] [--no-open]

    WIKI_ROOT       Path to a wiki root directory (contains wiki/).
                    If omitted, the server starts in picker mode and you can
                    open a wiki from the browser.
    --port          TCP port to bind. Default 8765 (override env: LWV_PORT).
    --host          Interface to bind. Default 0.0.0.0 (LAN-accessible).
                    Use 127.0.0.1 for local-only (override env: LWV_HOST).
    --no-open       Don't auto-open a browser on startup.

EXAMPLES
    python server.py                              # picker mode — choose wiki in browser
    python server.py /home/me/wikis/ai            # open a specific wiki directly
    python server.py /home/me/wikis/ai --port 9000 --host 127.0.0.1

WIKI LAYOUT
    The viewer expects the llm-wiki skill's directory layout:
        WIKI_ROOT/
            wiki/                — markdown content (concepts/, entities/, etc.)
            audit/               — audit feedback inbox (created if missing)
            CLAUDE.md            — wiki schema (optional but recommended)
            .viewer.json         — optional viewer customization (see below)

OPTIONAL .viewer.json AT WIKI ROOT
    All fields optional. Auto-detection from wiki/index.md is used as fallback.
        {
          "title":   "My Wiki",
          "tagline": "One-paragraph description.",
          "brand":   "MW",
          "featured": [
            { "tag": "Start here",
              "title": "Index",
              "blurb": "The full catalog of pages.",
              "path": "index" }
          ]
        }

SELF-UPDATING
    Markdown is read from disk on every request. Edit a page, refresh, done.
    No build step, no install step (Python 3 stdlib + CDN client deps).

RECENTS
    Recently opened wikis are persisted to ~/.llm-wiki-viewer-recents.json
    and shown in the browser picker on next launch.
"""

import argparse
import json
import os
import re
import socket
import sys
import uuid
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote


SCRIPT_DIR = Path(__file__).resolve().parent
RECENTS_FILE = Path.home() / ".llm-wiki-viewer-recents.json"

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)
WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]")
H1_RE = re.compile(r"^# (.+?)\s*$", re.MULTILINE)
BLOCKQUOTE_LEAD_RE = re.compile(r"^>\s?(.+?)(?=\n\n|\n#|\Z)", re.DOTALL | re.MULTILINE)

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}

VALID_SEVERITIES = ("info", "suggest", "warn", "error")


# ============================================================
# wiki root + paths (mutable — updated by open_wiki())
# ============================================================
class WikiPaths:
    root: Path
    wiki: Path
    audit: Path

    def __init__(self, root: Path, wiki_dir: Path = None):
        self.root = root
        self.wiki = wiki_dir if wiki_dir is not None else (root / "wiki")
        self.audit = root / "audit"


PATHS = None  # WikiPaths | None; set by open_wiki() or main()


# ============================================================
# helpers
# ============================================================
def detect_lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def parse_frontmatter(text: str):
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}, text
    body = m.group(1)
    rest = text[m.end():]
    fm: dict = {}
    for line in body.split("\n"):
        if ":" not in line or line.strip().startswith("#"):
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()
        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1].strip()
            fm[key] = [p.strip().strip('"').strip("'") for p in inner.split(",")] if inner else []
        else:
            fm[key] = val.strip('"').strip("'")
    return fm, rest


def safe_join(base: Path, rel: str):
    try:
        target = (base / rel).resolve()
        target.relative_to(base.resolve())
        return target
    except (ValueError, OSError):
        return None


def smart_brand(title: str) -> str:
    if len(title) <= 14:
        return title
    words = [w for w in re.split(r"\s+", title) if w and w[0].isalnum()]
    if not words:
        return title[:14]
    if len(words) == 1:
        return words[0][:14]
    initials = "".join(w[0] for w in words if w[0].isupper())[:4]
    if len(initials) >= 2:
        return initials
    return " ".join(words[:2])[:14]


# ============================================================
# recents + filesystem browsing
# ============================================================
def load_recents() -> list:
    try:
        data = json.loads(RECENTS_FILE.read_text(encoding="utf-8"))
        return [r for r in data if isinstance(r, str)]
    except Exception:
        return []


def save_recent(path: Path) -> None:
    path_str = str(path)
    recents = [r for r in load_recents() if r != path_str]
    recents.insert(0, path_str)
    try:
        RECENTS_FILE.write_text(json.dumps(recents[:10]), encoding="utf-8")
    except Exception:
        pass


def list_fs_dir(dir_path_str: str) -> dict:
    try:
        dir_path = Path(dir_path_str).resolve()
    except Exception:
        return {"path": dir_path_str, "parent": None, "entries": [], "error": "invalid path"}
    if not dir_path.is_dir():
        return {"path": str(dir_path), "parent": None, "entries": [], "error": "not a directory"}
    entries = []
    try:
        for e in sorted(dir_path.iterdir(), key=lambda x: x.name.lower()):
            if e.name.startswith(".") or not e.is_dir():
                continue
            is_wiki = (
                ((e / "wiki").is_dir() and (e / "wiki" / "index.md").is_file())
                or (e / "index.md").is_file()
            )
            entries.append({"name": e.name, "path": str(e), "is_wiki": is_wiki})
    except PermissionError:
        pass
    parent = str(dir_path.parent) if dir_path.parent != dir_path else None
    return {"path": str(dir_path), "parent": parent, "entries": entries}


def open_wiki(path_str: str) -> dict:
    global PATHS
    if not path_str:
        return {"ok": False, "error": "no path provided"}
    try:
        p = Path(path_str).resolve()
    except Exception as e:
        return {"ok": False, "error": str(e)}
    if not p.is_dir():
        return {"ok": False, "error": "path does not exist or is not a directory"}
    # Case A: standard llm-wiki layout — has wiki/index.md
    if (p / "wiki").is_dir() and (p / "wiki" / "index.md").is_file():
        PATHS = WikiPaths(p)
        save_recent(p)
        return {"ok": True, "path": str(p)}
    # Case B: p IS the wiki directory (has index.md directly)
    if (p / "index.md").is_file():
        PATHS = WikiPaths(p.parent, wiki_dir=p)
        save_recent(p)
        return {"ok": True, "path": str(p)}
    # Case C: has wiki/ but no index.md — still usable
    if (p / "wiki").is_dir():
        PATHS = WikiPaths(p)
        save_recent(p)
        return {"ok": True, "path": str(p)}
    return {"ok": False, "error": "not a valid wiki root — needs wiki/index.md or index.md"}


# ============================================================
# welcome data
# ============================================================
def welcome_data() -> dict:
    title = PATHS.root.name or "Wiki"
    tagline = ""

    index_path = PATHS.wiki / "index.md"
    if index_path.exists():
        text = index_path.read_text(encoding="utf-8")
        _, body = parse_frontmatter(text)
        m = H1_RE.search(body)
        if m:
            raw_title = m.group(1).strip()
            cleaned = re.sub(r"^Index\s*[—\-]\s*", "", raw_title).strip()
            title = cleaned or raw_title
        m = BLOCKQUOTE_LEAD_RE.search(body)
        if m:
            tagline = re.sub(r"\n>\s?", " ", m.group(1)).strip()

    brand = smart_brand(title)
    featured = [
        {"tag": "Start here", "title": "Index",
         "blurb": "The full catalog of pages in this wiki.", "path": "index"}
    ]

    config_path = PATHS.root / ".viewer.json"
    if config_path.exists():
        try:
            cfg = json.loads(config_path.read_text(encoding="utf-8"))
            if isinstance(cfg.get("title"), str):
                title = cfg["title"]
            if isinstance(cfg.get("tagline"), str):
                tagline = cfg["tagline"]
            if isinstance(cfg.get("brand"), str):
                brand = cfg["brand"]
            elif isinstance(cfg.get("title"), str):
                brand = smart_brand(cfg["title"])
            if "featured" in cfg and isinstance(cfg["featured"], list):
                featured = [c for c in cfg["featured"] if isinstance(c, dict)]
        except Exception as e:
            sys.stderr.write(f"  [warn] failed to parse .viewer.json: {e}\n")

    return {"title": title, "tagline": tagline, "brand": brand, "featured": featured}


# ============================================================
# tree + index
# ============================================================
def list_tree():
    def walk(d: Path):
        children = []
        for e in sorted(d.iterdir(), key=lambda x: (x.is_file(), x.name.lower())):
            if e.is_dir():
                if e.name.startswith("."):
                    continue
                children.append(walk(e))
            elif e.suffix == ".md":
                rel = e.relative_to(PATHS.wiki).as_posix()
                title = e.stem
                try:
                    head = e.read_text(encoding="utf-8")[:400]
                    fm, _ = parse_frontmatter(head)
                    if isinstance(fm.get("title"), str) and fm["title"]:
                        title = fm["title"].split("/")[-1]
                except Exception:
                    pass
                children.append({
                    "name": title,
                    "filename": e.stem,
                    "path": rel[:-3],
                    "is_file": True,
                })
        return {
            "name": d.name if d != PATHS.wiki else "wiki",
            "path": "" if d == PATHS.wiki else d.relative_to(PATHS.wiki).as_posix(),
            "is_file": False,
            "children": children,
        }

    if not PATHS.wiki.exists():
        return {"name": "wiki", "path": "", "is_file": False, "children": []}
    return walk(PATHS.wiki)


def build_stem_map():
    by_stem: dict = {}
    by_path: set = set()
    for p in PATHS.wiki.rglob("*.md"):
        rel_no_ext = p.relative_to(PATHS.wiki).as_posix()[:-3]
        by_path.add(rel_no_ext)
        by_stem.setdefault(p.stem, []).append(rel_no_ext)
    return by_stem, by_path


def resolve_wikilink(raw: str):
    by_stem, by_path = build_stem_map()
    target = raw.split("|", 1)[0].split("#", 1)[0].strip()
    if target in by_path:
        return {"found": True, "path": target, "ambiguous": False}
    if target in by_stem:
        candidates = by_stem[target]
        if len(candidates) == 1:
            return {"found": True, "path": candidates[0], "ambiguous": False}
        return {"found": True, "path": candidates[0], "ambiguous": True, "candidates": candidates}
    return {"found": False, "path": None, "ambiguous": False}


def search(q: str, limit: int = 25):
    q_lower = q.strip().lower()
    if not q_lower:
        return []
    results = []
    for p in PATHS.wiki.rglob("*.md"):
        try:
            text = p.read_text(encoding="utf-8")
        except Exception:
            continue
        text_lower = text.lower()
        score = 0
        snippet = ""
        if q_lower in p.stem.lower():
            score += 10
        idx = text_lower.find(q_lower)
        if idx >= 0:
            score += 3
            start = max(0, idx - 60)
            end = min(len(text), idx + len(q_lower) + 60)
            snippet = text[start:end].replace("\n", " ")
            if start > 0:
                snippet = "..." + snippet
            if end < len(text):
                snippet = snippet + "..."
        if score > 0:
            rel = p.relative_to(PATHS.wiki).as_posix()[:-3]
            results.append({"path": rel, "title": p.stem, "snippet": snippet, "score": score})
    results.sort(key=lambda r: -r["score"])
    return results[:limit]


# ============================================================
# audit creation
# ============================================================
def slugify(text: str, maxlen: int = 40) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return s[:maxlen] or "comment"


def create_audit(payload: dict) -> dict:
    required = ["target", "anchor_text", "anchor_before", "anchor_after",
                "severity", "author", "comment"]
    missing = [k for k in required if k not in payload]
    if missing:
        return {"ok": False, "error": f"missing fields: {', '.join(missing)}"}

    severity = payload["severity"]
    if severity not in VALID_SEVERITIES:
        return {"ok": False, "error": f"bad severity: {severity}"}

    target_rel = payload["target"]
    if not target_rel.endswith(".md"):
        target_rel = target_rel + ".md"
    target_path = safe_join(PATHS.wiki, target_rel)
    if target_path is None or not target_path.exists():
        return {"ok": False, "error": f"target not found: {target_rel}"}

    target_text = target_path.read_text(encoding="utf-8")
    anchor_text = payload["anchor_text"]
    pos = target_text.find(anchor_text)
    if pos < 0:
        return {"ok": False, "error": "anchor_text not found in target file"}
    line_start = target_text.count("\n", 0, pos) + 1
    line_end = line_start + anchor_text.count("\n")

    now = datetime.now().astimezone()
    ts_compact = now.strftime("%Y%m%d-%H%M%S")
    short_hex = uuid.uuid4().hex[:4]
    audit_id = f"{ts_compact}-{short_hex}"

    slug_seed = payload.get("comment") or anchor_text
    slug = slugify(slug_seed)
    filename = f"{ts_compact}-{slug}.md"
    target_field = f"wiki/{target_rel}"

    def yamls(s: str) -> str:
        return json.dumps(s, ensure_ascii=False)

    fm_lines = [
        "---",
        f"id: {audit_id}",
        f"target: {target_field}",
        f"target_lines: [{line_start}, {line_end}]",
        f"anchor_before: {yamls(payload['anchor_before'])}",
        f"anchor_text: {yamls(anchor_text)}",
        f"anchor_after: {yamls(payload['anchor_after'])}",
        f"severity: {severity}",
        f"author: {yamls(payload['author'])}",
        "source: web-viewer",
        f"created: {now.isoformat()}",
        "status: open",
        "---",
        "",
        "# Comment",
        "",
        payload["comment"].strip(),
        "",
        "# Resolution",
        "",
        "<!-- Filled in when the audit is processed and moved to resolved/ -->",
        "",
    ]

    PATHS.audit.mkdir(parents=True, exist_ok=True)
    out_path = PATHS.audit / filename
    out_path.write_text("\n".join(fm_lines), encoding="utf-8")
    return {"ok": True, "id": audit_id, "path": str(out_path.relative_to(PATHS.root))}


# ============================================================
# backlinks + audit inbox
# ============================================================
def build_backlinks(target_rel: str) -> list:
    target_stem = Path(target_rel).stem
    seen: set = set()
    results = []
    for p in PATHS.wiki.rglob("*.md"):
        rel = p.relative_to(PATHS.wiki).as_posix()[:-3]
        if rel == target_rel:
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except Exception:
            continue
        for raw in WIKILINK_RE.findall(text):
            link_target = raw.strip()
            if link_target in (target_rel, target_stem, Path(target_rel).name):
                if rel not in seen:
                    seen.add(rel)
                    fm, _ = parse_frontmatter(text)
                    title = (fm.get("title") if isinstance(fm.get("title"), str) else "") or p.stem
                    results.append({"path": rel, "title": title})
                break
    results.sort(key=lambda r: r["title"].lower())
    return results


def list_audits() -> list:
    if not PATHS.audit.exists():
        return []
    results = []
    for p in sorted(PATHS.audit.glob("*.md"), reverse=True):
        try:
            text = p.read_text(encoding="utf-8")
        except Exception:
            continue
        fm, body = parse_frontmatter(text)
        if not fm.get("id"):
            continue
        comment = ""
        in_comment = False
        for line in body.split("\n"):
            stripped = line.strip()
            if stripped == "# Comment":
                in_comment = True
                continue
            if stripped.startswith("# ") and in_comment:
                break
            if in_comment and stripped:
                comment = stripped
                break
        results.append({
            "id": fm.get("id", p.stem),
            "target": fm.get("target", ""),
            "severity": fm.get("severity", "info"),
            "author": fm.get("author", ""),
            "created": fm.get("created", ""),
            "status": fm.get("status", "open"),
            "anchor_text": fm.get("anchor_text", ""),
            "comment": comment,
        })
    return results


# ============================================================
# HTTP handler
# ============================================================
class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args):
        sys.stderr.write(f"  {self.address_string()} - {format % args}\n")

    def _send_json(self, status: int, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_static(self, name: str):
        path = SCRIPT_DIR / name
        if not path.exists() or not path.is_file():
            self.send_error(404, "Not found")
            return
        ext = path.suffix.lower()
        ctype = CONTENT_TYPES.get(ext, "application/octet-stream")
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _require_wiki(self) -> bool:
        if PATHS is None:
            self._send_json(503, {"error": "no wiki loaded — open one via /api/open"})
            return False
        return True

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path in ("/", "/index.html"):
            self._send_static("index.html")
            return
        if path in ("/style.css", "/app.js"):
            self._send_static(path.lstrip("/"))
            return

        # ── wiki-independent endpoints ────────────────────────────────────
        if path == "/api/health":
            self._send_json(200, {
                "ok": True,
                "has_wiki": PATHS is not None,
                "wiki_root": str(PATHS.root) if PATHS else None,
                "wiki_exists": PATHS.wiki.exists() if PATHS else False,
            })
            return

        if path == "/api/home":
            self._send_json(200, {"path": str(Path.home())})
            return

        if path == "/api/fs":
            dir_str = unquote(qs.get("path", [""])[0]) or str(Path.home())
            self._send_json(200, list_fs_dir(dir_str))
            return

        if path == "/api/recents":
            recents = load_recents()
            result = []
            for r in recents:
                p = Path(r)
                result.append({
                    "path": r,
                    "name": p.name,
                    "valid": p.is_dir() and (
                        ((p / "wiki").is_dir() and (p / "wiki" / "index.md").is_file())
                        or (p / "index.md").is_file()
                        or (p / "wiki").is_dir()
                    ),
                })
            self._send_json(200, result)
            return

        # ── wiki-dependent endpoints ──────────────────────────────────────
        if path == "/api/welcome":
            if not self._require_wiki(): return
            self._send_json(200, welcome_data())
            return

        if path == "/api/tree":
            if not self._require_wiki(): return
            self._send_json(200, list_tree())
            return

        if path == "/api/page":
            if not self._require_wiki(): return
            rel = unquote(qs.get("path", [""])[0])
            if not rel:
                self._send_json(400, {"error": "missing path"})
                return
            fp = safe_join(PATHS.wiki, rel + ".md")
            if fp is None or not fp.exists():
                self._send_json(404, {"error": f"not found: {rel}"})
                return
            text = fp.read_text(encoding="utf-8")
            fm, body = parse_frontmatter(text)
            self._send_json(200, {
                "path": rel,
                "title": (fm.get("title") if isinstance(fm.get("title"), str) else "") or fp.stem,
                "frontmatter": fm,
                "markdown": body,
                "raw": text,
            })
            return

        if path == "/api/resolve":
            if not self._require_wiki(): return
            name = unquote(qs.get("name", [""])[0])
            self._send_json(200, resolve_wikilink(name))
            return

        if path == "/api/search":
            if not self._require_wiki(): return
            q = unquote(qs.get("q", [""])[0])
            self._send_json(200, search(q))
            return

        if path == "/api/backlinks":
            if not self._require_wiki(): return
            rel = unquote(qs.get("path", [""])[0])
            if not rel:
                self._send_json(400, {"error": "missing path"})
                return
            self._send_json(200, build_backlinks(rel))
            return

        if path == "/api/audits":
            if not self._require_wiki(): return
            self._send_json(200, list_audits())
            return

        self.send_error(404, "Not found")

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            payload = json.loads(body)
        except json.JSONDecodeError as e:
            self._send_json(400, {"ok": False, "error": f"bad json: {e}"})
            return

        if self.path == "/api/open":
            result = open_wiki(payload.get("path", ""))
            self._send_json(200 if result.get("ok") else 400, result)
            return

        if self.path == "/api/audit":
            if not self._require_wiki(): return
            result = create_audit(payload)
            self._send_json(200 if result.get("ok") else 400, result)
            return

        self.send_error(404, "Not found")


# ============================================================
# entrypoint
# ============================================================
def main():
    p = argparse.ArgumentParser(
        prog="llm-wiki-viewer",
        description="Local web viewer for an llm-wiki-skill wiki.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("wiki_root", nargs="?", default=None,
                   help="Path to wiki root (contains wiki/). "
                        "If omitted, opens in picker mode — choose a wiki in the browser.")
    p.add_argument("--port", type=int,
                   default=int(os.environ.get("LWV_PORT", "8765")),
                   help="TCP port (default 8765 or $LWV_PORT)")
    p.add_argument("--host",
                   default=os.environ.get("LWV_HOST", "0.0.0.0"),
                   help="Bind interface (default 0.0.0.0 / LAN; use 127.0.0.1 for local-only)")
    p.add_argument("--no-open", action="store_true",
                   help="Don't auto-open a browser")
    args = p.parse_args()

    wiki_root_arg = args.wiki_root or os.environ.get("LWV_WIKI_ROOT")

    global PATHS
    if wiki_root_arg:
        result = open_wiki(wiki_root_arg)
        if not result.get("ok"):
            print(f"ERROR: {result['error']}", file=sys.stderr)
            sys.exit(2)

    lan_ip = detect_lan_ip()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    local_url = f"http://localhost:{args.port}"
    lan_url = f"http://{lan_ip}:{args.port}"
    bar = "=" * 64
    print(bar)
    if PATHS:
        print(f"  llm-wiki-viewer  ::  {PATHS.root}")
    else:
        print(f"  llm-wiki-viewer  ::  (no wiki — open one in the browser)")
    print(bar)
    print(f"  Local:  {local_url}")
    if args.host == "0.0.0.0" and lan_ip != "127.0.0.1":
        print(f"  LAN:    {lan_url}    <- share with others on your network")
    if PATHS:
        print(f"  Audit:  {PATHS.audit}")
    print(f"  Press Ctrl-C to stop.")
    print(bar)

    if not args.no_open:
        try:
            webbrowser.open(local_url)
        except Exception:
            pass

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
