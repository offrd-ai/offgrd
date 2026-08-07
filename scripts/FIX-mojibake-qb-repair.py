#!/usr/bin/env python3
"""
FIX-mojibake-qb-repair.py — repair U+FFFD ("diamond") corruption in OFFGRD-QB.html.

Usage:
    python3 FIX-mojibake-qb-repair.py <corrupted.html> <clean-donor.html> <out.html>

Donor = any older known-clean copy of the same file (root OFFGRD-QB.html in the
working folder, 0 FFFD, pins v=143). Works even if the corrupted file is newer:

  Pass 1 — donor alignment: line-pair via difflib; where a corrupted line matches a
           donor line except at FFFD positions (1-3 chars each), donate the original
           characters. (Recovered 190/195 on the v=150 mirror.)
  Pass 2 — explicit mapping for FFFD in code newer than the donor, each verified
           against donor house style (em dash separators, "▶ Snap" buttons).

Verified result on the mirror: 0 FFFD, node --check parse OK, smoke U+FFFD gate and
lone-? gate green across all 46 files.

NOTE for the real repo (v=238):
  * Run this against the repo's current OFFGRD-QB.html with the same donor. Pass 1
    is version-agnostic; if pass 2 misses a new corruption site, the script prints
    remaining contexts — extend EXPLICIT below, matching donor style.
  * Known-intentional: code comments contain lone "?" ("or null ? caller falls
    back") present in BOTH copies — pre-donor legacy, not user-visible. Left alone.
  * Canary needle in smoke-mojibake-chrome.cjs tracks
    'pressure here · "+t.n+" snaps' (lone-? gate also matches \\s?\\s\").
"""
import sys, re, difflib

EXPLICIT = [
    (' \ufffd that flag',                 ' — that flag'),
    (' \ufffd resolve week',              ' — resolve week'),
    ('+" \ufffd "+esc(PL(rep.blocker',    '+" — "+esc(PL(rep.blocker'),
    ('+" \ufffd "+rep.target.lab',        '+" — "+rep.target.lab'),
    ('+" \ufffd "+rep.blocker+(single?',  '+" — "+rep.blocker+(single?'),
    (')+" \ufffd "+rep.defLab',           ')+" — "+rep.defLab'),
    ('Now ? Snap \ufffd read the stunt',  'Now \u25b6 Snap — read the stunt'),
    ('" \ufffd ? Snap to see the front move.', '" — \u25b6 Snap to see the front move.'),
    ('id="snapBtn">? Snap</button>',      'id="snapBtn">\u25b6 Snap</button>'),
    # Already-lost glyph (not FFFD): ASCII "?" where U+21BB belonged.
    ('id="replayBtn">? Replay</button>',  'id="replayBtn">\u21bb Replay</button>'),
]

def main(corrupt_path, donor_path, out_path):
    a = open(donor_path, encoding='utf-8').read().splitlines()
    b = open(corrupt_path, encoding='utf-8').read().splitlines()
    pairs = {}
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == 'replace' and (i2 - i1) == (j2 - j1):
            for k in range(i2 - i1):
                pairs[j1 + k] = i1 + k
    out, fixed = [], 0
    for j, line in enumerate(b):
        if '\ufffd' not in line:
            out.append(line); continue
        donor = a[pairs[j]] if j in pairs else None
        if donor:
            pat = '^' + ''.join('(.{1,3})' if c == '\ufffd' else re.escape(c) for c in line) + '$'
            m = re.match(pat, donor)
            if m:
                new, gi = '', 0
                for c in line:
                    if c == '\ufffd':
                        gi += 1; new += m.group(gi)
                    else:
                        new += c
                out.append(new); fixed += line.count('\ufffd'); continue
        out.append(line)
    t = '\n'.join(out) + '\n'
    for bad, good in EXPLICIT:
        if bad in t:
            t = t.replace(bad, good); fixed += 1
    open(out_path, 'w', encoding='utf-8').write(t)
    rem = t.count('\ufffd')
    print(f'donor+explicit fixed: {fixed} | remaining FFFD: {rem}')
    if rem:
        for m in re.finditer('\ufffd', t):
            print('  UNFIXED ...%s...' % t[max(0, m.start()-30):m.start()+31].replace('\n', ' '))
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print(__doc__); sys.exit(2)
    main(*sys.argv[1:4])
