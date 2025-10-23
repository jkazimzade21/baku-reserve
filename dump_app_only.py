import os, sys, time, json, re
from pathlib import Path

# ---- CONFIG: what to include ----
BACKEND_WHITELIST_DIRS = ["backend/app", "backend/tests", "backend/scripts"]
BACKEND_WHITELIST_EXTS = {".py", ".toml", ".ini", ".cfg", ".md", ".txt", ".yaml", ".yml"}
BACKEND_SINGLE_FILES    = [
    "backend/requirements.txt",
    "backend/pyproject.toml",
    "backend/requirements-dev.txt",
    "backend/.env.example",
    "backend/.env"
]

FRONT_WHITELIST_DIRS = [
    "app", "src", "components", "screens", "hooks",
    "navigation", "utils", "constants", "services", "api"
]
FRONT_WHITELIST_EXTS = {".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".yaml", ".yml", ".mjs", ".cjs"}
FRONT_SINGLE_FILES   = [
    "App.tsx", "App.js", "package.json", "app.json", "app.config.js", "app.config.ts",
    "tsconfig.json", "babel.config.js", "metro.config.js", "eslint.config.js",
    "eslint.config.cjs", "prettier.config.js", "prettier.config.cjs", ".env", ".env.example"
]

SKIP_DIRS = {".git", "node_modules", ".venv", "__pycache__", ".expo", ".next", "ios", "android", "build", "dist", ".idea", ".vscode", ".pytest_cache", ".mypy_cache"}

def is_text(p: Path) -> bool:
    try:
        with p.open("rb") as f:
            chunk = f.read(2048)
        chunk.decode("utf-8")
        return True
    except Exception:
        return False

SECRET_PATS = [
    (re.compile(r'(?i)\b(password|pwd|pass|secret|token|api[_-]?key)\s*[:=]\s*\S+'), r'\1=***REDACTED***'),
    (re.compile(r'(?i)\b(database_url|db_url|database_uri|connection_string)\s*[:=]\s*\S+'), r'\1=***REDACTED***'),
]

def redact(s: str) -> str:
    for pat, repl in SECRET_PATS:
        s = pat.sub(repl, s)
    return s

def dump_files(root: Path, rel_paths, out_file: Path):
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with out_file.open("w", encoding="utf-8") as out:
        out.write(f"# App-only dump\n# Root: {root}\n# Generated: {time.strftime('%Y-%m-%dT%H:%M:%S')}\n")
        for rel in rel_paths:
            p = root / rel
            if not p.exists():
                continue
            if p.is_dir():
                for dp, dn, fn in os.walk(p):
                    dn[:] = [d for d in dn if d not in SKIP_DIRS]
                    for name in fn:
                        fp = Path(dp) / name
                        if fp.suffix.lower() not in BACKEND_WHITELIST_EXTS and fp.suffix.lower() not in FRONT_WHITELIST_EXTS:
                            continue
                        if not is_text(fp):
                            continue
                        out.write(f"\n===== FILE: {fp.relative_to(root)} =====\n")
                        try:
                            txt = fp.read_text(encoding="utf-8")
                        except Exception:
                            out.write("# [unreadable]\n")
                            continue
                        out.write(redact(txt))
                        if not txt.endswith("\n"):
                            out.write("\n")
            elif p.is_file():
                if p.suffix.lower() not in BACKEND_WHITELIST_EXTS and p.suffix.lower() not in FRONT_WHITELIST_EXTS:
                    continue
                if not is_text(p): 
                    continue
                out.write(f"\n===== FILE: {p.relative_to(root)} =====\n")
                try:
                    txt = p.read_text(encoding="utf-8")
                except Exception:
                    out.write("# [unreadable]\n")
                    continue
                out.write(redact(txt))
                if not txt.endswith("\n"):
                    out.write("\n")

def main():
    root = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else Path("~/baku-reserve").expanduser().resolve()
    out_dir = root / "code_dump"
    out_dir.mkdir(exist_ok=True)

    # BACKEND
    backend_dirs = [d for d in BACKEND_WHITELIST_DIRS if (root / d).exists()]
    backend_files = [f for f in BACKEND_SINGLE_FILES if (root / f).exists()]
    if backend_dirs or backend_files:
        dump_files(root, backend_dirs + backend_files, out_dir / "APP_BACKEND.txt")
        print(f"[i] wrote {out_dir / 'APP_BACKEND.txt'}")
    else:
        print("[i] No backend whitelist matches here")

    # FRONTEND: detect a JS/Expo root (either ./mobile or the root itself if it’s a JS app)
    js_roots = []
    for cand in [root, root / "mobile", root / "frontend"]:
        if (cand / "package.json").exists():
            js_roots.append(cand)

    if not js_roots:
        print("[i] No JS root (package.json) at", root, "or ./mobile")
    else:
        for idx, jroot in enumerate(js_roots, 1):
            rels = [d for d in FRONT_WHITELIST_DIRS if (jroot / d).exists()]
            files = [f for f in FRONT_SINGLE_FILES if (jroot / f).exists()]
            if not rels and not files:
                print(f"[i] JS root {jroot} has no whitelisted app dirs/files")
                continue
            outfile = jroot / "code_dump" / (f"APP_MOBILE_{idx}.txt" if jroot != root else "APP_MOBILE.txt")
            dump_files(jroot, rels + files, outfile)
            print(f"[i] wrote {outfile} (from JS root {jroot})")

    print("[i] DONE")

if __name__ == "__main__":
    main()
