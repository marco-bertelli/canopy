# UX and interface decisions

## Product brief

The primary user is a developer moving between local, staging, and production MongoDB environments. They need to find a collection, write a query, inspect a document, make a deliberate edit, and return to coding. The interface should be predictable, visually quiet, and useful without onboarding accounts or unrelated features.

The observations below are a heuristic review of typical desktop MongoDB clients, not an observed user session. There has been no external usability study; the conclusions below are design hypotheses checked through implementation, screenshot review, and automated interaction scenarios.

## Problems and responses

| Design observation                                         | Response                                                                             | Expected effect                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Many toolbars and nested tabs compete for attention        | One connection tree, collection tabs, five local modes                               | The user retains a stable sense of place              |
| A visual builder duplicates the text query                 | Steps and JSON share a single pipeline representation                                | Fewer concepts and no translation ambiguity           |
| Small icons carry unclear actions                          | Label the primary actions; provide accessible names/tooltips on secondary icons      | Easier discovery without clutter                      |
| Projection/sort/skip/limit occupy the workspace constantly | Put projection/sort under Options; keep a page-size control visible                  | Default browsing stays simple                         |
| Table and tree workflows are separated                     | Click a row to open an adjacent inspector                                            | Preserve the result table while exploring nested data |
| A blank inspector consumes valuable table width            | Start with the inspector closed; open it on selection                                | More useful data on first load                        |
| Dense gray panels offer little hierarchy                   | Use whitespace, quiet borders, a dark navigation area, and a restrained green accent | Clarify where to navigate, query, and read            |
| Platform-specific widget theming needs accommodations      | Render one UI in bundled Chromium                                                    | More consistent layout across Linux desktop themes    |

## Interaction model

1. **Connect:** paste a URI, choose a readable label/color/environment, optionally enable read-only, and connect. Production selects read-only initially. A failed connection preserves the form.
2. **Navigate:** the connection tree shows explicit connected state. Expand a database, filter collection names, and open a collection. Multiple tabs keep distinct queries/results. Create a database and its first collection directly from a connected server.
3. **Query:** the filter begins as `{}`. Projection/sort are a disclosure. Run is the primary colored action, available from keyboard. Results do not change until execution; a changed query is labeled stale.
4. **Read:** switch between table, collapsible document trees, and lossless JSON. Row selection opens an inspector. Table overflow scrolls rather than stretching the window. Missing fields, null, dates, identifiers, and numeric types have distinct formatting.
5. **Change:** editing occurs in an explicit dialog. BSON wrappers make type preservation visible. Destructive actions identify the scope, and dropping a collection requires its exact name. Read-only/projected/aggregated results disable writes. Concurrent edits produce a refresh instruction.
6. **Continue:** save queries locally or reopen a recent execution. The command menu searches both commands and loaded collections.

No invented live metrics, connection latency, activity feed, AI suggestions, sign-in prompts, upsell banners, or subscription state are included. Explain uses a static connected plan and reported server measurements. Execution duration is measured. Sample data is labeled as sample data. Schema is labeled as a sample; Explain in demo uses an explicitly labeled educational fixture, never numbers presented as measurements of the sample database. See the [aggregation and Explain study](aggregation-explain-ux.md) for the 0.3 design and verification.

## Visual system

- Dark charcoal navigation (`#192327`), near-white workspace, restrained green primary actions.
- Optional dark workspace with the same hierarchy. Editor colors must follow the active theme; screenshot review caught and corrected a white editor background in dark mode.
- System UI fonts and local monospace fallbacks. No remote fonts or image requests.
- Compact data tables, moderate page padding, 6–12 px component radii, subtle borders. Prioritize useful rows over decorative cards.
- Semantic HTML, named icon buttons, visible focus rings, modal focus containment/restoration, keyboard shortcuts, native form controls, and reduced-motion support.
- Minimum desktop window 980×640; layout additionally checked at 1024×768. This is a desktop application, not a mobile-first page. Horizontal result scrolling is intentional.

## Verification and remaining design work

Automated browser scenarios exercise the core flows, keyboard command search, invalid JSON, collection tabs, result views, paging, schema/indexes, CRUD confirmations, and compact dimensions. Screenshots in `docs/screenshots` document the light, dark, and compact layouts. Native desktop/IPC and MongoDB integration are verified separately.

Future usability testing should include novice users and developers handling deeply nested or very wide documents. Accessibility testing with real screen readers, full contrast auditing, index-building progress, very large result virtualization, and OS-specific window behavior remain areas for further work.
