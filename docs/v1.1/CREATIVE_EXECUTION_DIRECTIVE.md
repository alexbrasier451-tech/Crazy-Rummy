# Crazy Rummy v1.1 — Push-the-Boat-Out Execution Directive

**Status:** Binding creative execution and acceptance contract  
**Applies to:** Concept selection, implementation, review, and release sign-off

Codex must treat visual ambition as a required deliverable, not as an optional
enhancement.

The purpose of this overhaul is not merely to make Crazy Rummy cleaner,
more consistent, or more attractive. It is to create a dramatic, memorable,
highly authored game experience that appears substantially more ambitious than
the existing application.

Subject to the non-negotiable product constraints, Codex is explicitly
authorised and instructed to push the presentation as far as the supported
technology and approved performance budgets allow. Codex must not independently
reduce creative scope because an ambitious approach requires additional
implementation effort. Where a material constraint prevents the strongest
proposed treatment, Codex must record the constraint, show the preferred
design, and implement the strongest compliant alternative.

## Mandatory creative operating rule

Where two or more approaches are equally valid in terms of truthfulness,
privacy, usability, accessibility, and performance, Codex must choose the
approach that provides:

* the strongest Crazy Rummy identity;
* the greatest sense of atmosphere and physical presence;
* the most convincing card interaction;
* the most authored visual composition;
* the clearest sense of entering **The Midnight Limited**;
* the most memorable player experience.

Codex must not choose the simplest implementation merely because it satisfies
the functional requirement.

“Good enough,” “clean,” “tasteful,” “modern,” and “consistent” are not
sufficient acceptance standards for the principal game surfaces.

## Required transformation depth

The following, alone or in combination, do not constitute a successful
graphics overhaul:

* replacing the colour palette;
* adding design tokens;
* changing typography;
* rounding panels and controls;
* introducing brass borders or green backgrounds;
* adding a baize texture;
* restyling buttons;
* applying shadows and gradients;
* recolouring conventional playing cards;
* surrounding the existing layouts with railway ornament;
* adding several generic fades, slides, or hover effects;
* placing every route inside variations of the same dashboard panel.

These techniques may be used, but they must support a deeper transformation.

Codex may replace weak presentation markup, component anatomy, visual
hierarchy, route composition, responsive staging, card arrangement, decorative
systems, and animation choreography where this can be done without altering
application semantics.

Existing MVP presentation structures are not protected merely because they
already exist.

## Signature-experience requirement

Each major route must contain at least one distinctive visual idea created
specifically for that route.

The following moments must receive intentional presentation direction:

* application arrival;
* lobby arrival;
* game creation and joining;
* waiting for players;
* transition into a live game;
* announcement of the current wild rank;
* shuffle and deal;
* receipt of the opening hand;
* start of the local player's turn;
* card draw;
* taking the discard pile card;
* card selection and arrangement;
* successful meld creation;
* invalid meld or action rejection;
* discard;
* transition to the next player;
* connection loss and recovery;
* hand completion;
* score calculation and reveal;
* movement to the next wild rank;
* completion of the kings hand;
* final winner reveal.

Not every moment requires a large animation. Direction may be expressed through
composition, movement, lighting, typography, environmental response, sound,
haptics, card behaviour, or staged state transitions.

However, these moments must not feel like ordinary DOM updates with generic
transitions attached.

## Environmental ambition

The application should feel as though it takes place within the visual world
of **The Midnight Limited**, rather than appearing to be a web interface with a
train theme placed over it.

Codex must evaluate and implement an appropriate combination of:

* layered table, carriage, window, foreground, and background depth;
* warm directional light against black enamel and green baize;
* brass reflections, controlled bloom, edge highlights, and deep shadow;
* cream ticket stock, stamped ink, embossing, foil, paper fibre, grain, wear,
  and printed imperfections;
* abstract views of passing darkness, rain, station lights, signals, distant
  landscape, or carriage reflections;
* compartment numbers, route insignia, ticket punches, destination boards,
  luggage labels, conductor marks, plaques, and timetable-inspired notation;
* subtle environmental reactions to important game events;
* restrained depth on information-heavy states and stronger staging for major
  transitions and results.

Environmental detail must never imply false game information or compete with
an active decision.

## Cards as the hero system

The card system must be treated as the visual and interactive centrepiece of
the product.

Codex must create an authored Crazy Rummy card presentation rather than
conventional browser rectangles with decorative styling.

The card system must deliberately address:

* face and back design;
* rank and suit legibility;
* court-card treatment or an original abstract alternative;
* wild-rank presentation;
* selected, playable, invalid, grouped, newly drawn, and discard-candidate
  states;
* overlapping and fanned mobile hands;
* deck, discard, meld, and score-area presentation;
* movement continuity between card origins and destinations;
* deal, draw, lift, tilt, drag, snap, sort, group, meld, and discard behaviour;
* touch reliability when cards overlap;
* keyboard and screen-reader equivalents;
* reduced-motion substitutes;
* stable behaviour when the server rejects or corrects an attempted action.

Card movement must communicate the accepted state transition accurately. A card
must not visually complete an authoritative move before the application has
received the required acknowledgement.

## Composition, not dashboard repetition

Codex must not solve every route by placing headings, text, and controls inside
a centred stack of interchangeable rectangular panels.

Shared components should provide consistency without forcing every screen to
have the same silhouette.

Lobby, gameplay, rules, scoring, reconnection, and results surfaces may use
different compositions, levels of depth, pacing, and ornament appropriate to
their purpose.

Gameplay must remain the densest and most operationally direct surface.
Arrival, transition, and results surfaces may carry greater spectacle.

## Authored detail requirement

The implementation must include original visual details that are recognisably
specific to Crazy Rummy and **The Midnight Limited**.

Generic icon libraries, stock railway motifs, default playing-card graphics,
and standard component patterns may not form the primary identity.

The final system should contain a deliberate combination of original:

* insignia;
* card backs;
* ticket marks;
* route symbols;
* wild-rank treatments;
* decorative separators;
* loading indicators;
* status treatments;
* empty-state compositions;
* game-event flourishes;
* victory and final-score presentation.

## Iteration requirement

Codex must not stop after the first technically acceptable implementation.

For each approval keyframe and each principal gameplay surface, Codex must
consider at least three materially different compositional or presentation
approaches before selecting the proposed direction.

The alternatives must differ in structure or visual concept, not merely colour,
spacing, or ornament.

The selected approach should be accompanied by a concise explanation of:

* what makes it distinctive;
* why it belongs to Crazy Rummy;
* how it exceeds a conventional PWA reskin;
* how it protects legibility and interaction;
* what was rejected as too generic, too weak, or too expensive.

## Creative acceptance evidence

Creative ambition must be demonstrated through implementation evidence and
must not be accepted solely from a written claim that the direction has been
followed.

Before release sign-off, Codex must provide a creative-coverage record mapping:

* every major route to its route-specific visual idea;
* every required signature moment to its implemented presentation treatment;
* every card state and card movement to its visual, touch, keyboard,
  screen-reader, and reduced-motion behaviour;
* every proposed environmental technique to its implemented, rejected, or
  deferred disposition;
* every original production asset to its repository location and provenance
  record;
* every deliberate reduction in spectacle to the higher-priority constraint
  that required it.

For every rejected or deferred ambitious treatment, the record must state:

* the treatment that was considered;
* the concrete reason it could not be used;
* the higher-priority requirement or measured budget it would violate;
* the strongest compliant alternative that was implemented instead.

“Too difficult,” “too much work,” “unnecessary,” “the existing component was
adequate,” or “a simpler implementation was available” are not sufficient
reasons for reducing creative ambition.

The creative ambition gate passes only when the implemented application and
its recorded evidence demonstrate substantial transformation across route
composition, card presentation, game-event direction, environmental identity,
motion and feedback, state completeness, and authored visual detail.

The owner retains final authority over whether the result has pushed the boat
out sufficiently. Automated checks, completed work packages, and technical
compliance do not override that judgement.

## Failure conditions

The creative ambition gate fails if the result can reasonably be described as:

* the MVP with a premium colour palette;
* a tasteful dark-mode redesign;
* a collection of green and brass cards and panels;
* a generic luxury dashboard;
* an existing playing-card interface with train decorations;
* visually consistent but largely interchangeable routes;
* technically polished but forgettable;
* restrained primarily because restraint was easier to implement.

A successful result should make a returning player believe that the
presentation layer has been comprehensively rebuilt by someone with a strong,
specific creative vision.

The application should remain unmistakably Crazy Rummy in behaviour while
feeling dramatically more ambitious in presentation.
