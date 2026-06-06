#!/usr/bin/env python3
"""@gcu/cradle — doc preflight validator (Python, stdlib only). Catches problems BEFORE you
send a doc capsule: strict-YAML-subset frontmatter conformance, Markdown the renderer will
silently drop (raw HTML, bad link schemes, SVG/external images), and size limits.

    python validate.py report.md     # prints findings; exit 1 if any ERROR

Mirror of validate.mjs. The renderer is liberal at render time; this is the strict side.
"""
import re
import sys

from author import make_doc_capsule

ALLOW = {"theme": ["paper", "article", "terminal", "dark", "book"], "font": ["serif", "sans", "mono"],
         "density": ["comfortable", "compact", "relaxed"], "width": ["normal", "narrow", "wide"]}
SCALAR = {"title", "author", "date", "theme", "accent", "font", "density", "width", "images"}
BOOL = {"toc", "numbered"}
KNOWN = SCALAR | BOOL | {"tags"}
LINK_OK = re.compile(r"^(https?|mailto|tel):", re.I)
HEX = re.compile(r"^#([0-9a-f]{3}|[0-9a-f]{6})$", re.I)
MAX_BYTES = 256 * 1024
FM_RE = re.compile(r"^---\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|$)", re.S)


def split_fm(body):
    if not re.match(r"^---\r?\n", body):
        return "", body
    m = FM_RE.match(body)
    return (m.group(1), body[m.end():]) if m else ("", body)


def validate_doc(content):
    findings = []
    def add(level, msg): findings.append((level, msg))
    fm, md = split_fm(content)

    for i, raw in enumerate(fm.split("\n")):
        line = raw.rstrip()
        if not line.strip() or line.strip().startswith("#"):
            continue
        mm = re.match(r"^([A-Za-z][\w-]*)\s*:\s*(.*)$", line)
        if not mm:
            add("error", 'frontmatter L%d: not "key: value" -> %r' % (i + 1, line)); continue
        key, v = mm.group(1), mm.group(2).strip()
        if key not in KNOWN:
            add("warn", 'unknown frontmatter key "%s" (ignored)' % key)
        if re.match(r"^(yes|no|on|off|Yes|No|YES|NO)$", v):
            add("error", '"%s: %s" -- ambiguous boolean; the strict subset requires true/false/null' % (key, v))
        elif key in BOOL:
            if v not in ("true", "false"):
                add("warn", '"%s" should be true or false' % key)
        elif key == "tags":
            if not re.match(r"^\[.*\]$", v):
                add("warn", '"tags" should be a list, e.g. ["a", "b"]')
        elif key in SCALAR:
            if not (re.match(r'^".*"$', v) or re.match(r"^'.*'$", v)):
                add("error", '"%s: %s" -- string values MUST be quoted in the strict subset' % (key, v))
            else:
                s = v[1:-1]
                if key in ALLOW and s not in ALLOW[key]:
                    add("warn", '"%s: %s" not in {%s} -> falls back to default' % (key, s, ", ".join(ALLOW[key])))
                if key == "accent" and not HEX.match(s):
                    add("warn", 'accent "%s" is not a hex colour -> ignored' % s)
                if key == "images" and s not in ("inline", "external"):
                    add("warn", 'images "%s" -> defaults to inline' % s)

    fenced = False
    images_external = re.search(r'(^|\n)images:\s*["\']external["\']', fm) is not None
    for i, line in enumerate(md.split("\n")):
        if re.match(r"^\s*```", line):
            fenced = not fenced; continue
        if fenced:
            continue
        t = re.sub(r"`[^`]*`", "", line)
        # raw HTML -> text, BUT exempt CommonMark autolinks (<https://...>, <mailto:...>, <user@host>)
        t_html = re.sub(r"<[^>\s@]+@[^>\s]+>", "", re.sub(r"<(https?|mailto|tel):[^>\s]+>", "", t, flags=re.I))
        if re.search(r"<[a-zA-Z!/][^>]*>", t_html):
            add("warn", "L%d: raw HTML renders as TEXT -- doc has no HTML passthrough" % (i + 1))
        for m in re.finditer(r"!\[[^\]]*\]\(([^)\s]+)", t):
            src = m.group(1)
            if re.match(r"^data:image/svg\+xml", src, re.I):
                add("warn", "L%d: SVG data: image forbidden (XSS) -> dropped" % (i + 1))
            elif re.match(r"^https?:", src, re.I) and not images_external:
                add("warn", 'L%d: external image dropped -- set "images: external" to allow (breaks offline)' % (i + 1))
            elif re.match(r"^data:", src, re.I) and not re.match(r"^data:image/(png|jpe?g|gif|webp)", src, re.I):
                add("warn", "L%d: only raster data: images (png/jpeg/gif/webp) allowed" % (i + 1))
        for m in re.finditer(r"\]\(([^)\s]+)", re.sub(r"!\[[^\]]*\]\([^)]*\)", "", t)):
            href = m.group(1)
            sch = re.match(r"^[a-z][a-z0-9+.-]*:", href, re.I)
            if href.startswith("#") or LINK_OK.match(href) or not sch:
                continue
            add("warn", "L%d: link scheme dropped -> %s (only https/http/mailto/tel)" % (i + 1, sch.group(0)))

    if len(content) > MAX_BYTES:
        add("error", "body is %d B -- exceeds the 256 KB cap (would be truncated)" % len(content))
    return findings, len(make_doc_capsule(content))


def _cli():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.stderr.write("usage: validate.py <file.md>\n"); sys.exit(2)
    content = open(args[0], "r", encoding="utf-8").read()
    findings, cap_bytes = validate_doc(content)
    errs = [f for f in findings if f[0] == "error"]
    for level, msg in findings:
        sys.stdout.write("%s  %s\n" % ("X ERROR" if level == "error" else "! warn ", msg))
    sys.stdout.write("\n%s . %d warning(s) . capsule %d B\n" % (
        ("X %d error(s)" % len(errs)) if errs else "OK clean", len(findings) - len(errs), cap_bytes))
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    _cli()
