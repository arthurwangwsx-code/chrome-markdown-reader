# 高级能力验收

## Mermaid Gantt
```mermaid
gantt
  title V0.2 Delivery
  dateFormat YYYY-MM-DD
  section Reader
  Canvas :done, a1, 2026-09-01, 4d
  Export :active, a2, after a1, 5d
```

## Mermaid State
```mermaid
stateDiagram-v2
  [*] --> Reading
  Reading --> Exporting
  Exporting --> Reading
```

## Mermaid ER
```mermaid
erDiagram
  DOCUMENT ||--o{ DIAGRAM : contains
  DOCUMENT { string title }
  DIAGRAM { string engine }
```

## Mermaid Class
```mermaid
classDiagram
  class Reader { +open() +export() }
  class Diagram { +render() }
  Reader --> Diagram
```

## Mermaid Mindmap
```mermaid
mindmap
  root((Reader))
    Markdown
    Diagrams
      Mermaid
      Canvas
    Export
```

## JSON Canvas
```canvas
{
  "nodes": [
    {"id":"a","type":"text","x":0,"y":0,"width":220,"height":100,"text":"Markdown Reader"},
    {"id":"b","type":"text","x":360,"y":20,"width":220,"height":100,"text":"Offline Export"}
  ],
  "edges": [{"id":"e1","fromNode":"a","toNode":"b","label":"produces"}]
}
```

## Infographic
```infographic
infographic list-grid-badge-card
data
  title Reader Capabilities
  items
    - label Markdown
      desc Local-first reading
    - label Canvas
      desc JSON Canvas rendering
    - label DOCX
      desc Document export
```
