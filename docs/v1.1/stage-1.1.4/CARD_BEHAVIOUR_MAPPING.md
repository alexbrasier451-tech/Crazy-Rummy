# Stage 1.1.4 card-behaviour mapping

| State or role | Semantic source | Authored treatment | Non-colour / assistive equivalent |
| --- | --- | --- | --- |
| Face | Rank and suit from player/public view | Warm stock, inner keyline, conventional corners, centre suit | Full accessible rank/suit label |
| Court | Rank `J`, `Q`, or `K` | Quiet abstract route-diamond watermark | Conventional rank remains primary |
| Back / stock | Public stock count only | Mirrored double rails and `CR` node | `role="img"` and stock-count label |
| Wild | Rank equals authoritative hand wild rank | Double patterned border plus `WILD` | `data-wild`, visible word, label says wild |
| Selected | Local selection set | Lift, brass edge, check | Native `aria-pressed` and visible check |
| Playable | Current local turn and legal selection phase | Full-strength face | `data-playable`; disabled native button otherwise |
| Invalid | Caller-provided staged validation | Red dashed edge | `aria-invalid`, dashed edge, label says invalid |
| Grouped | Two or more staged selected cards | Shared nested outline | `data-grouped`, label says grouped |
| Newly drawn | Accepted view transition identifies one added card | Green edge and `DRAWN` tab | Label says just drawn; no motion required |
| Discard candidate | One staged card during discard/opening-discard | `DISCARD` receipt strip | Label says discard candidate |
| Pending intent | Local/queued action awaits completion or host acknowledgement | Locked `PENDING` rail; no destination travel | Label says pending host confirmation |
| Rejected | Authority rejects a queued/staged move | Dashed correction outline and `RETRY` | Label says rejected, still staged; persistent copy remains |
| Uncertain | Transport cannot confirm outcome | Double blue outline and `CHECKING` | Label says outcome uncertain; conflicting controls remain frozen |
| Public card | Discard or shared meld | Raised compact face, no private affordance | Article/span semantics and public visibility marker |
| Reduced motion | System or explicit reduced preference | No fan tilt, lift, pulse, or progress travel | State borders, labels, checks, and copy remain |
| Forced colours | `forced-colors: active` | System backgrounds and 2 px boundaries | Double/dashed patterns distinguish wild/pending/rejected |

Accepted travel remains owned by the existing acknowledgement-bound feedback
coordinator. Stage 1.1.4 adds stable source/destination presentation seams but
does not introduce new movement before Stage 6 reconciliation.

