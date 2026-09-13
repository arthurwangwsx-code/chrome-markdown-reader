# Chrome Markdown Reader

This is an independent Chrome Markdown reading extension project. It must not be
coupled to DevSpace's browser-control extension, Native Messaging, or personal
credentials. Read `docs/README.md` and the dated technical proposal before implementation.

## Current scope

Active implementation. Build the strongest practical local-first reader, using
selective upstream reuse when it materially improves capability. Do not describe a
feature as complete until its build/tests pass.

## Engineering rules

- Preserve `file://` direct-reading as the primary workflow.
- Distinguish heading TOC from a user-authorized filesystem tree.
- Treat Markdown, diagram definitions, raw HTML, URLs, and SVG as untrusted input.
- Bundle runtime JavaScript/WASM locally; no remote executable code or document upload.
- Do not broaden permissions to debugger, cookies, history, or nativeMessaging.
- Reference checkouts under `参考工程/` remain read-only and excluded from releases.
  Mature upstream ideas/code may be selectively ported into tracked product files;
  record the source revision and keep notices instead of making the build depend on
  ignored local checkouts.
- Record upstream revisions and licenses before reusing code. GPL-derived code may
  not be relabeled MIT. Preserve upstream notices and use a distinct product identity.
- Never commit local documents, absolute personal paths in fixtures, tokens, browser
  profiles, credentials, CRX signing keys, or private/company source.
- The intended final product is public and open source. Publishing still happens only
  after the product is buildable and the repository is ready for public consumption.
- Validate changes in bounded batches; do not interrupt unrelated machine processes.
