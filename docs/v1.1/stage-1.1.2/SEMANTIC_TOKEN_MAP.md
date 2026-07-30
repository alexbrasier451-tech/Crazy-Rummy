# Stage 1.1.2 semantic token map

| Semantic role | Primitive / implementation | Degraded or forced-colour disposition |
| --- | --- | --- |
| Page void | `--surface-void` / `--midnight-1000` | `Canvas` |
| Carriage hardware | `--surface-carriage` / `--carriage-900` | `Canvas` + 2 px `CanvasText` edge |
| Shared table | `--surface-table` / `--baize-800` | Solid `Canvas`; texture removed |
| Raised table/object | `--surface-table-raised` / `--baize-700` | Boundary and label remain |
| Ticket stock | `--surface-ticket` / `--ticket-100` | `Canvas`; perforation removed |
| Current decision | `--state-current` / `--brass-500` | `Highlight` or labelled boundary |
| Accepted/legal | `--state-accepted` / `--signal-green` | Text, check, and boundary |
| Rejected/blocking | `--state-rejected` / `--signal-red` | Text, icon, and boundary |
| Network information | `--state-information` / `--signal-blue` | Text and signal shape |
| Object travel | `--duration-card`, `--ease-card-settle` | Immediate accepted destination |
| Route advance | `--duration-route` | Static named current/next stop |
| Environmental texture | `--texture-*`, `--effect-*` | Removed for high contrast, reduced data, and degraded quality |

Legacy `--color-*` names remain as semantic compatibility aliases so the
presentation can be replaced route by route without introducing literal
colour decisions or changing stable component behaviour.
