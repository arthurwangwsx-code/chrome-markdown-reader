# Chrome Web Store Listing 草案

## Name

Markdown Reader Pro

## Short description

Local-first Markdown reader with folders, diagrams, math, smart search and offline export.

## Detailed description

Markdown Reader Pro turns local Markdown files into a full technical-document reading workspace directly inside Chrome.

- Open local `file://` Markdown directly from the address bar.
- Browse authorized folders with a persistent workspace and incremental index.
- Smart local search across file names, paths and document content.
- Render Mermaid, Graphviz, Vega/Vega-Lite, ECharts, PlantUML-compatible diagrams, draw.io, JSON Canvas and AntV Infographic.
- Render KaTeX math and highlighted code.
- Export to PDF/Print, offline HTML, DOCX, EPUB, SVG and PNG.
- Progressive rendering for large documents.
- Local-first design: documents are not uploaded to a rendering service.

The extension requires Chrome's “Allow access to file URLs” option for direct `file://` reading. Folder access is requested only when the user explicitly selects a folder.

## Privacy summary

The reader works locally. It does not include analytics, an account system or document upload. Document content, recent workspace handles and search index data remain in browser-local storage. External resources in diagram specifications are blocked by default in supported renderers.

## Listing assets

Run `npm run store:assets` to generate a real 1280×800 product screenshot from the advanced fixture. Release builds generate 16/32/48/128 PNG extension icons automatically.
