# Mermaid Runtime Regression

This fixture keeps the syntax shapes that matter for local technical-design documents while using only
synthetic product names and endpoints.

## Flowchart with quoted labels and Unicode

```mermaid
flowchart LR
    U(["Portal User 用户"])
    L["Card list preview"]
    D1["Card detail V1"]
    D2["Card detail V2"]
    VC["Shared card component"]
    QL["list.json — existing"]
    QD["detail.json — existing"]
    U --> L
    U --> D1
    U --> D2
    L --> VC
    D1 --> VC
    D2 --> VC
    QL --> L
    QD --> D1
    QD --> D2
```

## Sequence with aliases, alternate branches and property paths

```mermaid
sequenceDiagram
    autonumber
    actor U as User 用户
    participant FE as Portal FE
    participant API as Existing Card API
    U->>FE: Open Card List / Card Detail
    alt Card List
        FE->>API: POST /api/card/list.json
    else Card Detail V1/V2
        FE->>API: POST /api/card/detail.json
    end
    API-->>FE: card status + existing card data + holder.displayName
    FE-->>U: Render compliant card front
    Note over FE: LABEL + approved logo + holder name + number/CVC on front
```

## Sequence with state values

```mermaid
sequenceDiagram
    autonumber
    actor U as User 用户
    participant FE as Portal FE
    participant API as Existing Card API
    U->>FE: Open Frozen / Cancelled card
    FE->>API: list.json or detail.json
    API-->>FE: status = Frozen / Cancelled + existing payload
    alt Frozen
        FE-->>U: Blank face + Frozen overlay
    else Cancelled
        FE-->>U: Blank face + Cancel overlay
    end
    Note over FE: Do not expose active-only sensitive fields on masked face
```

## Sequence with 5xx and timeout text

```mermaid
sequenceDiagram
    autonumber
    actor U as User 用户
    participant FE as Portal FE
    participant API as Existing Card API
    U->>FE: Enter List / Detail
    FE->>API: Existing list / detail
    alt success
        API-->>FE: 200 existing contract
        FE-->>U: Render card face
    else 5xx / timeout
        API-->>FE: Error / timeout
        FE-->>U: Reuse existing error handling#59; no false-success card face
    end
```

## Sequence with long uppercase configuration key

```mermaid
sequenceDiagram
    autonumber
    actor U as User 用户
    participant FE as Portal FE
    participant CFG as FE grayscale config
    U->>FE: Open card surface
    FE->>CFG: Read FEATURE_CARD_FACE_COMPLIANCE
    alt enabled
        FE-->>U: New compliant card face
    else disabled
        FE-->>U: Legacy rendering remains usable
    end
```
