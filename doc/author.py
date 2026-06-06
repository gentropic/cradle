#!/usr/bin/env python3
"""@gcu/cradle — doc capsule author (Python, stdlib only: zlib + base64).

Turns a Markdown document (with optional YAML frontmatter) into a `!doc1+` capsule and a
shareable cradle URL. The recipient opens the link; cradle renders it — no file, no host.

    python author.py report.md                       # -> prints the share URL
    cat report.md | python author.py - --locale pt-BR
    python author.py report.md --base https://gentropic.org/cradle/

Mirror of author.mjs (same capsule scheme). Run validate.py first to catch problems.
Capsule scheme: !doc1+<locale>\\n<body>  ->  raw-deflate  ->  inline:deflate:<base64url>.
"""
import sys
import zlib
import base64

DEFAULT_BASE = "https://gentropic.org/cradle/"


def make_doc_capsule(content, locale="en-US"):
    payload = ("!doc1+%s\n%s" % (locale, content)).encode("utf-8")
    co = zlib.compressobj(9, zlib.DEFLATED, -zlib.MAX_WBITS)   # raw deflate (no zlib header)
    raw = co.compress(payload) + co.flush()
    b64url = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    return "inline:deflate:" + b64url


def fragment_encode(s):   # SPEC-capsule §6.4.1 (no-op for base64url; kept for parity)
    return s.replace("%", "%25").replace(" ", "%20")


def make_doc_url(content, locale="en-US", base=DEFAULT_BASE):
    cap = make_doc_capsule(content, locale)
    return base.rstrip("/") + "/#" + fragment_encode(cap)


def _cli(argv):
    file = None
    locale = "en-US"
    base = DEFAULT_BASE
    i = 0
    rest = argv[1:]
    while i < len(rest):
        if rest[i] == "--locale":
            i += 1; locale = rest[i]
        elif rest[i] == "--base":
            i += 1; base = rest[i]
        elif not rest[i].startswith("--"):
            file = rest[i]
        i += 1
    if not file:
        sys.stderr.write("usage: author.py <file.md|-> [--locale en-US] [--base URL]\n")
        sys.exit(2)
    content = sys.stdin.read() if file == "-" else open(file, "r", encoding="utf-8").read()
    cap = make_doc_capsule(content, locale)
    url = base.rstrip("/") + "/#" + fragment_encode(cap)
    sys.stdout.write(url + "\n")
    ub = len(url)
    nfc = " · ".join("%s %s" % (n, "OK" if ub <= c else "X") for n, c in (("NTAG213", 144), ("NTAG215", 504), ("NTAG216", 888)))
    sys.stderr.write("capsule %d B · URL %d B · NFC: %s\n" % (len(cap), ub, nfc))


if __name__ == "__main__":
    _cli(sys.argv)
