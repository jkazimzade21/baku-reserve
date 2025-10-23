import os, re, sys, time, json

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.expanduser("~/baku-reserve")
OUT  = os.path.join(ROOT, "code_dump")
os.makedirs(OUT, exist_ok=True)

SKIP_DIRS = {".git","node_modules",".venv","__pycache__",".pytest_cache",".mypy_cache",".expo",".next","build","dist","ios","android",".idea",".vscode"}
SKIP_EXT  = {".png",".jpg",".jpeg",".webp",".gif",".ico",".pdf",".svg",".mp4",".mov",".zip",".gz",".tar",".bin",".lock",".xcworkspace",".xcodeproj"}

def is_probably_text(path, blocksize=2048):
    try:
        with open(path, "rb") as f:
            chunk = f.read(blocksize)
        chunk.decode("utf-8")
        return True
    except Exception:
        return False

SECRET_PATTERNS = [
    (re.compile(r'(?i)\b(password|pwd|pass|secret|token|api[_-]?key)\s*[:=]\s*\S+'), r'\1=***REDACTED***'),
    (re.compile(r'(?i)\b(database_url|db_url|database_uri|connection_string)\s*[:=]\s*\S+'), r'\1=***REDACTED***'),
]

def redact(text: str) -> str:
    for pat, repl in SECRET_PATTERNS:
        text = pat.sub(repl, text)
    return text

def write_structure():
    out_path = os.path.join(OUT, "STRUCTURE.txt")
    lines = [f"# Repo structure (filtered)\n# Root: {ROOT}\n"]
    for dirpath, dirnames, filenames in os.walk(ROOT):
        # prune unwanted dirs in-place
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        rel = os.path.relpath(dirpath, ROOT)
        lines.append(rel if rel != "." else ".")
        for fn in filenames:
            p = os.path.join(dirpath, fn)
            lines.append("  " + os.path.relpath(p, ROOT))
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return out_path

def dump_dir(src_dir: str, out_file: str):
    with open(out_file, "w", encoding="utf-8") as out:
        out.write(f"# Code dump for {src_dir}\n# Generated: {time.strftime('%Y-%m-%dT%H:%M:%S')}\n\n")
        for dirpath, dirnames, filenames in os.walk(src_dir):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for fn in filenames:
                p = os.path.join(dirpath, fn)
                _, ext = os.path.splitext(fn)
                if ext.lower() in SKIP_EXT:
                    out.write(f"\n===== FILE (binary skipped): {os.path.relpath(p, ROOT)} =====\n")
                    continue
                if not is_probably_text(p):
                    out.write(f"\n===== FILE (binary skipped): {os.path.relpath(p, ROOT)} =====\n")
                    continue
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        txt = f.read()
                except Exception:
                    out.write(f"\n===== FILE (unreadable skipped): {os.path.relpath(p, ROOT)} =====\n")
                    continue
                txt = redact(txt)
                out.write(f"\n===== FILE: {os.path.relpath(p, ROOT)} =====\n")
                out.write(txt)
                if not txt.endswith("\n"):
                    out.write("\n")

def detect_frontend_roots():
    """Return list of dirs that look like JS apps (package.json present)."""
    hits = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        if "package.json" in filenames:
            pkg_path = os.path.join(dirpath, "package.json")
            try:
                with open(pkg_path, "r", encoding="utf-8") as f:
                    pkg = json.load(f)
                # flag expo/react-native web projects
                if "expo" in (pkg.get("dependencies") or {}) or pkg.get("name"):
                    hits.append(dirpath)
            except Exception:
                hits.append(dirpath)
    return hits

def main():
    print(f"[i] ROOT: {ROOT}")
    struct = write_structure()
    print(f"[i] wrote {struct}")

    # backend dump if exists
    backend_dir = os.path.join(ROOT, "backend")
    if os.path.isdir(backend_dir):
        out_backend = os.path.join(OUT, "CODE_BACKEND.txt")
        dump_dir(backend_dir, out_backend)
        print(f"[i] wrote {out_backend}")
    else:
        print("[i] backend/ not found under ROOT")

    # try to detect frontend
    fronts = detect_frontend_roots()
    if fronts:
        for i, d in enumerate(fronts, 1):
            outf = os.path.join(OUT, f"CODE_FRONTEND_{i}.txt")
            dump_dir(d, outf)
            print(f"[i] wrote {outf} (from {os.path.relpath(d, ROOT)})")
    else:
        print("[i] no JS app detected (no package.json). if your mobile app is elsewhere, run:  python3 dump_code.py /path/to/root")

    print("[i] DONE. Outputs are in", OUT)

if __name__ == "__main__":
    main()
