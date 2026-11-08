# The Home page, line by line

Every file behind the Home page, its code beside plain-words notes: the page,
its cards, the library components they use, and the hooks and React Query
code that feed them data. Dotted words open a definition; a glossary lists
them all.

Run `python3 docs/learning/home-page/build.py`, then open
`docs/learning/home-page/dist/home-page.html` in a browser. The copy on Claude,
https://claude.ai/artifact/Sz7j5dNmnHDS5P4Y4s4juL, adds **Ask Claude** on
every row, answered on the reader's own Claude account; elsewhere that button
stays hidden.

## Change it

| File | Holds |
| --- | --- |
| `page_notes.py`, `library_notes.py`, `hook_notes.py` | The notes: `(line, text)` per file, keyed to the line each explains |
| `terms.py` | The words that get a definition, and the forms that match them |
| `codify.py` | Marks code words in a note as code |
| `reader.template.html` | The page: layout, styles, tooltips, the chat |
| `build.py` | Reads each file at `HEAD`, joins it to its notes, writes `dist/home-page.html` |

Run `python3 docs/learning/home-page/build.py` after a change. Notes point at
line numbers in the last commit, so when a file they cover changes, check its
notes still land on the right lines.
