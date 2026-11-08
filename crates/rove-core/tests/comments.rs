//! The house rule for comments, as the UI's ESLint rule holds it
//! (`scripts/eslint/comments.ts`), over every `.rs` file in the workspace:
//! short, a `//` note in at most 6 lines of text, a `///` doc in at most 10,
//! and anything longer belongs in `docs/`. A module's `//!` header, which
//! documents the whole file, is exempt.
//!
//! clippy can't take house rules, so this runs with `cargo test`.

use std::fs;
use std::path::{Path, PathBuf};

const MAX_NOTE_LINES: usize = 6;
const MAX_DOC_LINES: usize = 10;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Kind {
    /// `//`
    Note,
    /// `///`
    Doc,
    /// `//!`
    Header,
    /// `/* */`
    Block,
}

struct Comment {
    kind: Kind,
    line: usize,
    col: usize,
    text: String,
    is_whole_line: bool,
}

/// A position in a source file that tracks its line, column and line start.
struct Cursor {
    chars: Vec<char>,
    i: usize,
    line: usize,
    col: usize,
    line_start: usize,
}

impl Cursor {
    fn new(source: &str) -> Self {
        Self { chars: source.chars().collect(), i: 0, line: 1, col: 0, line_start: 0 }
    }

    fn is_done(&self) -> bool {
        self.i >= self.chars.len()
    }

    fn peek(&self, k: usize) -> Option<char> {
        self.chars.get(self.i + k).copied()
    }

    fn starts_with(&self, s: &str) -> bool {
        s.chars().enumerate().all(|(k, c)| self.peek(k) == Some(c))
    }

    fn advance(&mut self, n: usize) {
        for _ in 0..n {
            let Some(c) = self.peek(0) else { return };
            if c == '\n' {
                self.line += 1;
                self.col = 0;
                self.line_start = self.i + 1;
            } else {
                self.col += 1;
            }
            self.i += 1;
        }
    }

    /// Advance past the next `s`, or to the end.
    fn advance_past(&mut self, s: &str) {
        while !self.is_done() && !self.starts_with(s) {
            self.advance(1);
        }
        self.advance(s.chars().count());
    }
}

/// Every comment in `source`, skipping string, raw string and char literals.
fn comments(source: &str) -> Vec<Comment> {
    let mut cur = Cursor::new(source);
    let mut found = Vec::new();
    while !cur.is_done() {
        let prev = cur.i.checked_sub(1).map(|k| cur.chars[k]);
        if cur.starts_with("//") {
            let (line, col) = (cur.line, cur.col);
            let is_whole_line = cur.chars[cur.line_start..cur.i].iter().all(|c| c.is_whitespace());
            let start = cur.i;
            while cur.peek(0).is_some_and(|c| c != '\n') {
                cur.advance(1);
            }
            let text: String = cur.chars[start..cur.i].iter().collect();
            let (kind, marker) = if text.starts_with("///") && !text.starts_with("////") {
                (Kind::Doc, 3)
            } else if text.starts_with("//!") {
                (Kind::Header, 3)
            } else {
                (Kind::Note, 2)
            };
            found.push(Comment { kind, line, col, text: text[marker..].to_string(), is_whole_line });
        } else if cur.starts_with("/*") {
            // Block comments nest in Rust.
            let (line, col, start) = (cur.line, cur.col, cur.i);
            let mut depth = 0;
            loop {
                if cur.starts_with("/*") {
                    depth += 1;
                    cur.advance(2);
                } else if cur.starts_with("*/") {
                    depth -= 1;
                    cur.advance(2);
                } else {
                    cur.advance(1);
                }
                if depth == 0 || cur.is_done() {
                    break;
                }
            }
            let text = cur.chars[start..cur.i].iter().collect();
            found.push(Comment { kind: Kind::Block, line, col, text, is_whole_line: false });
        } else if cur.peek(0) == Some('r') && !prev.is_some_and(|c| c.is_alphanumeric() || c == '_') && {
            let hashes = (1..).take_while(|&k| cur.peek(k) == Some('#')).count();
            cur.peek(1 + hashes) == Some('"')
        } {
            let hashes = (1..).take_while(|&k| cur.peek(k) == Some('#')).count();
            cur.advance(2 + hashes);
            cur.advance_past(&format!("\"{}", "#".repeat(hashes)));
        } else if cur.peek(0) == Some('"') {
            cur.advance(1);
            while cur.peek(0).is_some_and(|c| c != '"') {
                cur.advance(if cur.peek(0) == Some('\\') { 2 } else { 1 });
            }
            cur.advance(1);
        } else if cur.peek(0) == Some('\'') {
            // A char literal ('x', '\n', '\u{..}'); a lone `'` is a lifetime.
            let len = if cur.peek(1) == Some('\\') {
                (2..12).find(|&k| cur.peek(k) == Some('\'')).map(|k| k + 1)
            } else {
                (cur.peek(2) == Some('\'')).then_some(3)
            };
            cur.advance(len.unwrap_or(1));
        } else {
            cur.advance(1);
        }
    }
    found
}

/// The problems in one file's source, as `line: message`.
fn problems(source: &str) -> Vec<String> {
    let found = comments(source);
    let mut problems = Vec::new();

    // Consecutive whole-line comments of one kind in one column read as one.
    let mut groups: Vec<Vec<&Comment>> = Vec::new();
    for comment in &found {
        let is_continuation = groups.last().and_then(|g| g.last()).is_some_and(|last| {
            comment.is_whole_line
                && last.is_whole_line
                && last.kind == comment.kind
                && last.col == comment.col
                && comment.line == last.line + 1
        });
        match groups.last_mut() {
            Some(group) if is_continuation => group.push(comment),
            _ => groups.push(vec![comment]),
        }
    }
    for group in groups {
        let (marker, limit) = match group[0].kind {
            Kind::Note => ("//", MAX_NOTE_LINES),
            Kind::Doc => ("///", MAX_DOC_LINES),
            Kind::Header | Kind::Block => continue,
        };
        let text_lines = group.iter().filter(|c| !c.text.trim().is_empty()).count();
        if text_lines > limit {
            problems.push(format!(
                "{}: keep this {marker} comment to {limit} lines (it has {text_lines}): say why, briefly; detail belongs in docs/",
                group[0].line
            ));
        }
    }
    problems.sort_by_key(|p| p.split(':').next().and_then(|n| n.parse::<usize>().ok()));
    problems
}

/// Every `.rs` file under `dir`, skipping build output.
fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if path.file_name().is_some_and(|n| n != "target" && n != "gen") {
                rust_files(&path, out);
            }
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

#[test]
fn every_comment_follows_the_house_rules() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut files = Vec::new();
    rust_files(&root.join("crates"), &mut files);
    rust_files(&root.join("src-tauri/src"), &mut files);
    assert!(files.len() > 50, "found only {} .rs files under {}", files.len(), root.display());

    let mut report = Vec::new();
    for file in &files {
        let source = fs::read_to_string(file).expect("read a source file");
        let name = file.strip_prefix(&root).unwrap_or(file).display().to_string();
        report.extend(problems(&source).into_iter().map(|p| format!("{name}:{p}")));
    }
    assert!(report.is_empty(), "{} comment problem(s):\n{}", report.len(), report.join("\n"));
}

#[test]
fn flags_an_overlong_note_but_not_strings_or_headers() {
    let source = "//! A header may run long.\n//! Two.\n//! Three.\n//! Four.\n//! Five.\n//! Six.\n//! Seven.\n\
        fn f() {\n    let s = \"// not a comment\";\n    // one\n    // two\n    // three\n    // four\n    \
        // five\n    // six\n    // seven\n}\n";
    let found = problems(source);
    assert_eq!(found.len(), 1, "{found:?}");
    assert!(found[0].starts_with("10: keep this // comment to 6 lines"), "{found:?}");
}
