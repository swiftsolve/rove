"""Marks code references in a plain-words note with backticks, leaving prose alone."""
import re

# Words that look like code by shape but are prose here.
PROSE = {'TypeScript', 'JavaScript', 'TanStack', 'StrictMode', 'IconTile', 'macOS', 'iPhone', 'WebKit'} - {'IconTile'}

TAILWIND_PREFIXES = (
    'rounded|text|bg|gap|min|max|flex|grid|mb|mt|my|mx|ml|mr|px|py|p|m|sr|w|h|self|items|justify|absolute|relative|'
    'inset|translate|opacity|shrink|truncate|z|border|transition|duration|ease|cursor|pointer|whitespace|overflow|'
    'inline|leading|font|type|size|col|row|place|order|basis|grow|top|left|right|bottom|outline|ring|shadow|usable'
)

PATTERNS = [
    r'<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>',                       # <button>, </span>, <dl>
    r'\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\([^()\s]*\)',     # reload(), navigate({ … }) short forms, api.getPublicIp()
    r'-?\b(?:' + TAILWIND_PREFIXES + r')-[\w\[\]().%/:-]*[\w\]\)]', # rounded-[inherit], gap-10, -my-4, sr-only
    r'\b[a-z]+[A-Z][\w$]*\b',                                      # camelCase: hasFocusFrame, useNetwork
    r'\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+\b',                      # PascalCase: ConnectionStrip, QueryClientProvider
    r'\b(?:null|undefined)\b',
    r'\b[\w-]+\.(?:tsx|ts|css)\b',                                 # file names
    r'\b(?:skipToken|queryKey|queryFn)\b',
]
CODE_RE = re.compile('|'.join(f'(?:{p})' for p in PATTERNS))


def codify(text: str) -> str:
    # Leave anything already in backticks as it is.
    parts = re.split(r'(`[^`]*`)', text)
    out = []
    for part in parts:
        if part.startswith('`') and part.endswith('`') and len(part) > 1:
            out.append(part)
            continue
        def mark(match: re.Match) -> str:
            word = match.group(0)
            if word in PROSE:
                return word
            return f'`{word}`'
        out.append(CODE_RE.sub(mark, part))
    return ''.join(out)


if __name__ == '__main__':
    samples = [
        "The open/close wrapper: told whether it's open, and what to call on a click. hasFocusFrame rings the whole card when it has keyboard focus; rounded-[inherit] keeps that ring's corners matching the card's.",
        "reload(): drop any read in flight and read afresh.",
        "A real <button>. On hover or keyboard focus the tint deepens. `usable:` means only while it's not disabled.",
        "Each item can shrink and, on one line, end with \"…\" when there's no room. Wi-Fi and Ethernet both use the blue accent.",
        "From React Query: hashKey turns a key into a string, skipToken means \"don't fetch\", and useQuery is the core hook.",
        "No network info yet: draw nothing. The app's frame shows its own loading screen. If the computer hides it, null shows a dash. Raised above the click area, -my-4 lets it overlap; sr-only hides it. Full-row button, a two-column grid, run-test button.",
    ]
    for s in samples:
        print(codify(s))
        print()
