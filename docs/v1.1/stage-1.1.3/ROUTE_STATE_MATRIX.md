# Stage 1.1.3 route/state matrix

| Route | State | Presentation and truth source |
| --- | --- | --- |
| `/` | No identity | `Choose your player`; first route node and complete static text alternative. |
| `/` | Saved identity | Named `Your seat is ready`; lobby and change-player paths only. |
| `/identity` | New | Personal-seat ticket, empty native required field, four labelled marker radios. |
| `/identity` | Recovered | Existing name and marker retained; ticket says `Change player`, never profile/account. |
| `/identity` | Invalid | Native validation blocks submit without navigation; value/focus remain. |
| `/identity` | Saving | Submit is locked and `aria-busy` before the synchronous device-local write/navigation. |
| `/lobby` | Loading | Neutral unpunched ticket skeleton plus `Updating…`; no invented table. |
| `/lobby` | Healthy | Online freshness rail, ticket gates, public-only table invitations. |
| `/lobby` | Empty | Unpunched ticket plus the existing create-or-refresh instruction. |
| `/lobby` | Stale | Last good tickets retained with `May be out of date` freshness. |
| `/lobby` | Offline | Offline signal and online-presence recovery action; no closed/private listing. |
| `/lobby` | Error | Existing safe error presenter retains last good results and manual retry. |
| `/lobby` | Incompatible | Version warning and Settings path; incompatible table is not joinable. |
| `/lobby` | Create | Audience disclosure, capacity, immutable rules, and live review strip; one request at a time. |
| `/lobby` | Join code | Normalised code submit with reserved error space; service result remains authoritative. |
| `/waiting-room` | No room | Empty carriage seat, safe Lobby return, explicit statement that no invite/recovery was invented. |
| `/waiting-room` | Assembling | Ordered accepted/open seat plaques, textual readiness and lobby-confirmation checks. |
| `/waiting-room` | All ready | Departure line reaches `Depart`; host start becomes enabled but never automatic. |
| `/waiting-room` | Offline/error | Persistent needs-attention signal; readiness/start actions remain disabled by existing logic. |
| `/waiting-room` | Connecting | Stable connecting message replaces mutable readiness action. |
| `/waiting-room` | Started | Authorised `Join started match` hand-off replaces pre-start controls. |
| `/waiting-room` | Guest | Ready/leave actions only; host controls are absent. |
| `/waiting-room` | Host | Exact start blocker plus separately labelled host-only destructive section. |

Public/private boundary: discovery tickets use only the existing safe
`tableSummary` presenter. Invite codes remain inside the active closed waiting
room and never enter startup, identity, public lobby rows, or route imagery.
