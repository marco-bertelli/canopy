# Aggregation and Explain: UX/UI study

## Scope and evidence

This is an expert interface review and task analysis, followed by implementation and interaction checks. It is not a usability study with recruited developers. Evidence: the existing Canopy flows and MongoDB's documented Explain output.

The intended user knows JSON and MongoDB operators. Their difficulty is maintaining context while iterating, rather than learning another visual programming language.

## Developer tasks and friction

| Task                                           | Existing friction                                              | Design response                                                                      | Verification                                        |
| ---------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Locate the transformation that loses documents | A single pipeline text block hides intermediate boundaries     | Ordered stages and explicit input/output previews                                    | Preview a prefix without replacing the draft        |
| Temporarily isolate a stage                    | Removing JSON risks losing work                                | Disable stages without deleting them; persist that state                             | Save/reopen and run disabled pipelines              |
| Change ordering                                | Cut/paste across braces is error prone                         | Named move, duplicate, and delete actions                                            | Keyboard-accessible buttons and boundary states     |
| Paste a known pipeline                         | A builder can become a second incompatible language            | Steps and JSON share the same pipeline representation                                | JSON round trips preserve Extended JSON             |
| Identify unnecessary work                      | Raw Explain requires finding and interpreting scattered fields | Summary, connected plan, selected-stage evidence, next checks                        | Real server plans and parser fixtures               |
| Understand a warning                           | A score or red badge can imply unsupported certainty           | Each finding states evidence, meaning, and a conditional next step                   | No automatic index creation or performance promises |
| Trust the numbers                              | Planner estimates look like measured time                      | Distinct planner and explicit execution modes; unavailable values remain unavailable | No fabricated timing or inferred node counts        |

## Information hierarchy

Aggregation keeps collection navigation, pipeline editing, and results in the same workspace. The stage list gives orientation; one focused editor avoids many simultaneous code panes. Preview input runs preceding enabled stages. Preview output includes the selected stage. Both start at page one, use the existing result viewer, and identify their scope. Neither rewrites the full pipeline. Preview results are a limited page, not a cardinality measurement or materialized checkpoint; each preview reruns its prefix against current data.

Explain answers three questions in order: what did the server choose, how much work was reported, and what should I inspect next? The primary view is a connected source-to-result plan. Branches remain branches. Selecting a node shows its operator, index/bounds/filter when reported, and stage measurements. Server output is retained behind a disclosure for unusual or unsupported fields.

Rejected: animated particles, perpetual pulses, 3D graphs, a general-purpose node canvas with pan/zoom, pie charts of cumulative timings, a synthetic performance score, and automatically proposed index definitions. These add interaction or certainty without helping these tasks.

## Visual and interaction rules

- Static connectors communicate flow. Green marks selection and primary actions; amber identifies a specific check. Labels and symbols carry meaning as well as color.
- One restrained metric band, a plan surface, and contextual detail. No decorative charts or motion. Missing measurements show an em dash with an explanation.
- Every operation has a named keyboard-accessible control. A native combobox supports operator choice; focus styling remains visible in both themes.
- JSON is read-only while stages are disabled; an explicit Enable all action makes it editable. This prevents reordering text from silently moving disabled positions.
- Invalid JSON stays editable. Switching representation must not silently discard text. Stage disabling survives query saves/history through explicit metadata.
- Explain is a snapshot. Returning to the query is explicit. `Run & measure` visibly says it executes the query; the user can stop it. Limits and scope are stated before execution.

## Data fidelity

[MongoDB Explain results](https://www.mongodb.com/docs/manual/reference/explain-results/) describe a tree whose children feed their parent. Classic and SBE structures differ. The implementation preserves those relationships, separates cursor statistics from later aggregation stages, and retains unknown output for inspection. Stage time estimates are never summed or presented as exclusive costs. Index scans alone do not prove a query is efficient; collection scans alone do not prove it is slow.

[MongoDB Explain modes](https://www.mongodb.com/docs/manual/reference/command/explain/) distinguish planning from executing the winning plan. Canopy defaults to planning. Execution is an explicit request with cancellation and a 15-second server time limit. Find explains its displayed page (without the lookahead document). Aggregation explains the complete enabled pipeline, without UI pagination, so late-stage work is visible. Explain timing excludes client transport and is not a prediction of normal cached-query latency.

## Implementation review

The first screenshot review found that editor mode buttons inherited icon-only widths and that Explain put too much explanatory text above the graph. Both were corrected. Diagnostic text now uses a darker secondary color in the light theme, with the same hierarchy in dark mode. The main flow is static and uses native buttons rather than a canvas requiring custom keyboard navigation.

The implementation preserves extended BSON JSON, invalid drafts, and disabled stages across saved queries. Preview scope remains separate from the full draft. Explain leaves absent values blank rather than treating them as zero. A grouped result does not trigger a read-amplification warning merely because many inputs became a few groups. The keyboard check also caught CodeMirror’s default Ctrl/⌘ Enter inserting a blank line before the global run handler. The query binding now has priority and runs exactly once without changing the draft. Detailed tests and screenshots are listed in [validation.md](validation.md).

Supported output includes classic and SBE plans, aggregation cursor stages, and shard branches. A split merger definition is explicitly identified as unexpanded; unusual nested operator definitions remain available in stage evidence and raw output. This is not a complete visualization of every MongoDB internal stage.

## Remaining research

Observe developers finding a selective filter, a blocking sort, and a problematic aggregation stage. Measure time to correctly identify the issue and whether they can explain the scope of previews and metrics. Validate with screen readers and real multi-shard plans; fixtures cannot establish production usability or cover every server format.
