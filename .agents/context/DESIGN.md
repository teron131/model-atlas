---
name: Model Atlas
description: Live model evidence charted as a frontier sky, with charcoal research planes floating among the stars
colors:
  paper-light: "#f2f4f2"
  paper-dark: "#0b1016"
  ink-light: "#202724"
  ink-dark: "#f2f3ed"
  muted-light: "#5f665d"
  muted-dark: "#bbc1b7"
  faint-light: "#656d63"
  faint-dark: "#969f93"
  horizon-cobalt: "#4a72ff"
  horizon-violet: "#8f6bff"
  horizon-rose: "#ff92bd"
typography:
  display:
    fontFamily: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif'
    fontSize: "clamp(64px, min(15.2vw, 26svh), 232px)"
    fontWeight: 500
    lineHeight: 0.98
    letterSpacing: "-0.058em"
  region:
    fontFamily: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif'
    fontSize: "clamp(44px, 8.8vw, 136px)"
    fontWeight: 500
    lineHeight: 0.86
    letterSpacing: "-0.054em"
  readout:
    fontFamily: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif'
    fontSize: "24px"
    fontWeight: 620
    letterSpacing: "-0.035em"
  body:
    fontFamily: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif'
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.5
  model-name:
    fontFamily: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif'
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.015em"
  data:
    fontFamily: '"SFMono-Regular", "SF Mono", Menlo, Consolas, monospace'
    fontSize: "13px"
    fontWeight: 500
  label:
    fontFamily: '"SFMono-Regular", "SF Mono", Menlo, Consolas, monospace'
    fontSize: "12px"
    fontWeight: 650
    letterSpacing: "0.035em"
  caption:
    fontFamily: '"SFMono-Regular", "SF Mono", Menlo, Consolas, monospace'
    fontSize: "11px"
    fontWeight: 650
    letterSpacing: "0.035em"
  micro:
    fontFamily: '"SFMono-Regular", "SF Mono", Menlo, Consolas, monospace'
    fontSize: "10px"
    fontWeight: 650
    letterSpacing: "0.035em"
  note:
    fontFamily: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif'
    fontSize: "15px"
    fontWeight: 500
  document-title:
    fontFamily: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif'
    fontSize: "clamp(36px, min(9vw, calc(var(--document-frame) * 0.068)), 72px)"
    fontWeight: 500
    lineHeight: 0.86
    letterSpacing: "-0.054em"
  document-heading:
    fontFamily: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif'
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  document-subheading:
    fontFamily: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif'
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.02em"
rounded:
  square: "0"
  icon: "3px"
  research: "0"
spacing:
  page-gutter: "clamp(24px, 4.2vw, 72px)"
  research-inset: "clamp(14px, 2vw, 28px)"
  research-gap: "clamp(48px, 7svh, 80px)"
components:
  research-plane:
    backgroundColor: "{colors.paper-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.research}"
  research-plane-light:
    backgroundColor: "{colors.paper-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.research}"
---

# Design System: Model Atlas

## Overview

**Creative North Star: "Frontier Sky"**

Model Atlas is a star atlas for language models. Every displayed model is a star over a glowing planetary horizon, placed by release date and Intelligence, and the frontier roles are named like stars on a chart. Scrolling scopes the camera past the horizon into the star field, where each research region opens with its name set large on the sky above an opaque charcoal plane holding dense, factual tables and charts. Inside the planes the same physics holds: every frontier is drawn as a lit horizon and every model is a star. The methodology pages share the sky as a still reading page.

The sky carries the drama and the planes carry the evidence. The sky may move, glow, and leave its mapping implicit; nothing in a plane depends on it, so planes stay opaque, factual, and explicit about how values become marks.

**Key Characteristics:**

- One continuous column of research regions under a full-bleed sky
- Models as round stars everywhere: in the sky, in every chart, and on the leaderboard's score tracks
- Provider colour and icon as each model's persistent identity
- Frontiers drawn as lit horizons over the region they reach
- Region names at display size on the sky, above their planes
- Measurement typography for labels and data
- Opaque research planes lit along their top edge, distinct from the sky

## Colors

Dark is the default: blue-charcoal planes with chalk ink, kept neutral against the navy sky so every content boundary reads at a glance. The light theme sets mineral-paper planes under the same night sky. Both are real surfaces, not a darkened or inverted illustration.

### Primary

- **Horizon Cobalt** (#4a72ff), **Horizon Violet** (#8f6bff), **Horizon Rose** (#ff92bd): the environment's light, usually together as the horizon gradient. They colour the planet's rim, the lit top edge of every plane and floating surface, navigation flight paths, selection stars, and the horizons that draw analytical frontiers.

### Neutral

- **Blue Charcoal** (#0b1016) and **Mineral Paper** (#f2f4f2): dark and light research planes and chart fields.
- **Chalk Ink** (#f2f3ed) and **Carbon Ink** (#202724): primary text, numbers, and structural marks.
- **Muted** (#bbc1b7 dark, #5f665d light): secondary text and idle controls.
- **Faint** (#969f93 dark, #656d63 light): placeholders and values that step back, such as the weaker side of a comparison.

### Named Rules

**The Evidence Chroma Rule.** Provider colours are data: they stay on every model's star, mark, icon, label, and row, selected or not. Horizon colours belong to the environment, chrome, and frontiers, which mark where the data reaches, so they never identify a model or provider. Selection and orientation marks inside the data stay ink.

**The Distinct Planes Rule.** Planes are never tinted toward the sky, so content boundaries always read against it.

## Typography

**Display and body:** Avenir Next, with Segoe UI, Helvetica, and Arial fallbacks.
**Labels and data:** SFMono-Regular, with SF Mono, Menlo, and Consolas fallbacks.

**Character:** a wide, calm sans sets the field and names things; compact monospace carries measurements, parameters, and state.

### Hierarchy

- **Display** (500, clamp(64px, min(15.2vw, 26svh), 232px), 0.98): the hero title in two lines with the second indented 1.4em, so it keeps one shape at every width and aspect ratio and only scales.
- **Region** (500, clamp(44px, 8.8vw, 136px), 0.86): research region names on the sky. The methodology title uses the same style scaled to its frame, and image exports set region names at 30px.
- **Readout** (620, 24px, tabular): the headline figure of an analysis, such as the Pareto summary's median and the Timeline catalogue entry, and the model sheet's name at 600. One size keeps the headline numbers in agreement.
- **Body** (500, 16px, 1.5): factual prose.
- **Note** (500, 15px): panel copy, figure captions, and tooltip prose.
- **Model name** (600, 15px): leaderboard model names; ranks share the size at 500, and the slug beneath is mono at 11px.
- **Data** (mono, 13px, tabular): scores, prices, and model metadata in tables; the model sheet sets its readouts at 600.
- **Label** (mono, 650, 12px, 0.035em, usually uppercase): parameters, axes, column headers, and compact controls.
- **Caption** (mono, 650, 11px): secondary annotations.
- **Micro** (mono, 650, 10px): the floor for dense annotations; nothing is set smaller.
- **Document heading and subheading** (600, 24px and 18px): methodology sections inside the plane.

### Named Rules

**The Shrinking Planes Rule.** A phone plane is about a third of the desktop's width, so type steps down with it rather than holding desktop sizes in less room. At 720px and below the readout drops to 20px, notes to 14px (13px in the model sheet), data to 12px, and model names to 14px, and a phone chart's ticks, axis titles, and plotted names take the caption size.

## Layout

The dashboard is one column. Header, hero text, research rail, leaderboard, and analysis planes share one content width, and only the sky is full-bleed. Content may scroll sideways where its density requires it, but the page itself never overflows.

The hero fills the first viewport with only the title and the frontier register; no lede, status line, or controls compete with the sky. The register lists the frontier roles in order (Best Intelligence, Best Agentic, Another Lab, Best Open Weight, Pareto Balance, Pareto Value) in six columns, three at 1100px and below, and one at 720px and below. A role without a distinct model falls back to the next strongest by Intelligence, while the Pareto roles drop out instead.

A sticky research rail follows, linking three numbered regions: Models, Pareto, and Timeline. Each region opens on the sky with its name at display size, the same two-digit ordinal hanging at its cap height, and its capture and link actions at the far edge; one module owns the sequence, so the rail and the region heads cannot disagree. The plane follows directly below its name. One even gap of sky separates the rail from the first region and each plane from the next name, well over the gap between a name and its own plane, so each name reads with the plane it opens.

Responsive changes keep the model evidence visible:

- At 820px and below, the Timeline catalogue entry sets its name on its own line above its three figures, so an ordinary name is never cut short.
- At 760px and below, labels and controls reflow, and the leaderboard folds its four score columns into a strip beneath each model's name: the same numbers over the same star tracks, sorted by four score marks on the model header's line.
- At 520px and below, the rail drops its ordinals.

## Elevation & Depth

Depth comes from the sky behind and opaque planes floating in it.

### The sky

One fixed WebGL layer renders the sky behind the dashboard: a dark stippled planet whose rim glows cobalt at its centre through violet to rose at its sides, drifting dust motes, the model stars, a flare on the star being explored, and faint nebulae that strengthen as the camera scopes in. A CSS film grain sits above it. The planet is solid, so dust sets behind it rather than showing through. Nearer motes blur into dimmer discs so they never outshine a model, and while the camera moves each mote smears briefly along its own path.

Each model star is a white-hot core in a corona of its provider's colour, and frontier roles add long rays whose tips disperse red beyond blue, with light running slowly outward along them. Every star and mote drifts on its own slow path a few pixels from its place, and names keep to their stars' resting places.

The pointer stirs only the sky near it: stars and motes within reach lean toward it as if it had gravity, each star at its own pace, and ease back when it leaves, while the rest of the sky holds still. The lean fades to nothing at the pointer itself, so a star under it stays put to be explored.

A pulse of light runs along the rim from left to right as the stars begin to light and every 15 seconds after, and the rim rests calm between pulses.

**Opening.** The dashboard stays dark until the sky can draw and the hero has its models, then fades in whole over 1.2 seconds; where WebGL cannot run, CSS draws the same horizon still, and a ten-second safety net shows the page without scripts or data. The horizon is at full strength from the first frame. The stars light scattered across the sky, each at its own moment with a brief flash, its rays extending and its name appearing as it lights, so no edge or direction leads, while the rim's first pulse crosses on its own path.

**Scroll.** The camera starts at the hero composition. Scrolling tilts it up and pushes it forward as if leaving the planet: the horizon tightens from a shallow arc into a limb while still in view, then pans down and out as the stars spread with true perspective parallax. The arc is proportioned to the viewport, so every width shows the same curve and the same tightening. Past the hero the camera continues a slow flight that ends before the nearest star.

**Cost.** The sky renders at 24 FPS in the hero and 12 FPS past it, at full rate while scrolling, during the opening, and while a flare settles, with a capped pixel ratio, and ambient motion stops while the page is hidden. Reduced motion keeps the hero still, with no camera travel, pointer pull, twinkle, drift, rim pulses, or staggered opening, while hovering still identifies stars.

### Planes and floating surfaces

Research planes are opaque so model and chart contrast never depends on the sky: the theme's paper, a fine edge, a horizon-gradient line along the lit top edge, and a deep shadow that blooms violet in the dark theme. Floating surfaces, from hover cards, column tooltips, and filter menus to the model sheet, share the lit top line. The sticky research rail is the one frosted surface, blurred over whatever passes beneath it. Controls and data cells stay flat.

## Shapes

Research planes and everything in them have square corners, controls are square and compact, and provider icons keep a 3px radius. Models are round stars everywhere. In the Pareto chart a star's area tracks the mean of the model's available scores, while hover cards and the leaderboard carry the individual scores.

## Components

### Selection and buttons

The selected option turns full ink and is lit by a small selection star beneath it: the leaderboard's score star in horizon-violet light, with a soft bloom that faintly lights its label. The bloom belongs to the star, so no control box clips it. Hover previews a dimmer star. No underline, track, or pill marks selection. Buttons are square, borderless or 1px ruled, and keyboard focus draws a 2px ring without moving the layout.

### Inputs

Fields are transparent. Search fields show focus by brightening their search icon, with no line or ring, in the rail's model search and the leaderboard's column search alike; ruled fields, such as the leaderboard's row count, strengthen their rule.

Checklists for benchmarks, organizations, and efforts open from a ruled summary into one shared menu: a bulk checkbox, square marks, and a right-aligned count per option. A press outside or Escape closes them.

### Navigation

Navigation is a flight path. The research rail draws a hairline track with a waypoint under each region link and a selection star that travels with the scroll; the stretch already flown is lit in horizon light and passed waypoints turn violet. No tab underline, divider, pill, or filled background marks the current region.

The global model search holds the rail's open middle at every width, and / reaches it from anywhere, first bringing the leaderboard up beneath the rail when the reader is still in the hero. Typing filters every view and lists the strongest matching models beneath the search, where arrows choose one and Enter opens its model sheet. Each active filter is a ruled chip after the search that removes only itself, provider chips keeping their provider mark, and on phones the chips, profiles, and additional filters fold behind a toggle. Whether reasoning variants expand is one of those filters, applied to the graphs and the leaderboard together.

The leaderboard's horizontal scrollbar is a second flight path above its headers, drawn as the rail is. Each column group's name sits where the group starts, with its waypoint beneath it, and each group's stretch follows what it counts (benchmarks for benchmark groups, columns otherwise), so its length reads as its size. Names nudge apart to stay legible, a crowded name gives way to the group being read unless it has keyboard focus, a name scrolls its group to just past the pinned columns, and dragging along the track scrolls to the pointer.

### Leaderboard

The toolbar holds column presets (All first, then Scores, Cost, and Time), a column search that takes the free width and offers a model search when the query names models instead, the row count, and an effort checklist for reasoning-variant rows.

Rows read as a measurement table:

- Ranks are set in the sans at the model-name size, bright for the leading three, and model names lead each row with the slug beneath.
- Score cells keep the number primary at 700 with its meter directly beneath: a track from 0 to 100 with the provider-coloured star at the score and a trail brightening toward it. Tracks share one width and a half-way tick, so reading down a column still shows gaps and clusters.
- Resource ratios (Cost×, Time×, Tokens×) draw a provider-coloured bar from a 1× median tick on one fixed doubling scale that reaches the track's ends at 16× and 1/16×, so a wide tail never shrinks everyone else and the same factor draws the same length in every column. No star marks a ratio. Cost× and Time× carry a down arrow because lower is better there; Tokens× carries none because fewer tokens are not plainly better.
- Every other measured amount, from prices, throughput, latency, and context to each benchmark's own cost, time, and tokens, keeps its value as the readout and draws the same bar against its column's median, with the ratio on hover. Position always means amount, never goodness.
- Hairline rules close each column group so the wide table never reads as one band; they never box a single column.
- Row hover blends 6% of the row's provider colour into the ink wash, and the row whose model sheet is open keeps 12% with a provider rule at its leading edge. The tint is always the model's own data colour.

### Analytical figures

Each analysis reads as a published figure. The chart leads the plane, and each axis control sits on the axis it controls: Pareto performance above the y-axis beside the score summary, resources beneath the x-axis, and the Timeline's view choices above its plot beside its catalogue entry. Controls, legend, readout, and caption share the graph's own width and edges. The region's description, evidence note, and axis note become a caption beneath the chart, followed by the evidence disclosure.

Frontiers are drawn as the sky's horizon: a white-hot rim over a horizon-gradient edge with a soft glow above, extended at the outermost model's height to the plot edge on the side the reached region continues, over a faint wash of the region it reaches. Every model the frontier outperforms sits inside the lit region. Each Pareto frontier step answers the pointer: its stretch of rim lights, and the hover card of the model it reaches adds the trade from the frontier model before it. The Timeline's record frontier joins each record directly to the next, a rising ridge rather than a staircase.

Chart stars echo the score stars without blooming: a lit centre in a solid ring of the provider colour, crisp enough to separate neighbours in dense clusters. Only frontier models, and the Timeline's chosen model, glow, from one blurred layer beneath the marks, so a chart costs a single filter. Index-only Timeline models are hollow rings, and in the light theme stars are solid with fainter glows. Hover cards set the model name semibold beside a neutral logo frame, and their edge takes a trace of the provider colour.

The Pareto score summary is a box-and-whisker instrument: the median dominates as a readout and an ink line, while the range and quartile box stay hairline.

The Timeline's selected model reads as a star-catalogue entry on the figure's top edge: its ringed provider star, name, Intelligence Index, release date, and evidence support at the readout size, the name kept to one line so following the pointer never moves the plot. The overview strip carries the same frontier as a small horizon. In the models view a replay control sweeps the window from start to end in nine seconds: models appear as their release dates pass, the record frontier draws itself to the date reached, and the catalogue entry follows each new record. The axes hold still, reduced motion steps through still frames, and changing the window, preset, or view stops it.

Scores have one model: the backend score contract is the source of truth for Intelligence, Agentic, Speed, and Value, charts translate it only in their star-mark geometry, and the sky maps it through its own adapter.

### Model sheet

A model's full catalogue entry opens as an opaque plane at the viewport's right edge below the header. It is non-modal, so the header and rail stay usable. Leaderboard rows, chart stars, frontier roles, hero stars, and the Timeline entry open it; the URL names it (`model`, `effort`), so a sheet is shareable, and Back, Escape, or its close button return focus to whatever opened it. Choosing another model switches it in place, and a click elsewhere hides it.

The sheet measures the model against the leaderboard's own population (collapsed models, or every reasoning variant for a variant) and reuses the table's marks: identity and facts, the four scores on star tracks with rank and support, resources on ratio bars, a frontier-position plot of Intelligence against Cost×, the reasoning efforts as a curve of Intelligence against cost, benchmark evidence in the table's groups, and the latest material change. Its plots draw models as the leaderboard's score star, a solid core with a soft bloom on the lit model, never a chart's ringed mark. The effort curve places variants as the Pareto chart does, each effort's cost taken from the benchmarks all of the family's efforts share, so a step compares like with like; beneath it, segmented effort choices switch the sheet, the collapsed choice being the leaderboard's own row.

Compare keeps the current model, and the next one opened appears beside it, the kept model on the left with every row aligned, one frontier plot lighting both stars and one effort plot drawing both curves. Each row's better value keeps full ink and states its margin while the other steps back; tokens and descriptive facts mark neither. While the kept model waits, a search beneath the head suggests partners from the whole snapshot, whatever the dashboard's filters hide. The URL's `compare` and `compare-effort` make a comparison shareable. A click elsewhere hides the sheet but keeps the kept model, while Escape and close let it go.

The sheet is 496px wide, or 880px when comparing. On phones its actions take their own row so the name keeps the full width, and a comparison too narrow for its plane keeps each value, margin, and rank while leaving meters and bars to the single sheet.

### Image exports

Every image export is 1200px wide, or 1440px for a comparison card, rendered at twice that resolution so text stays sharp. A region capture holds its heading and figure without the plane's decorative edge, shadow, border, or rounding; captions, evidence disclosures, actions, and other interactive parts stay out and leave no gap. The model card is laid out wide, with the identity across the top, facts, scores, and resources beside the two plots, and benchmark groups in columns below. Its plots are redrawn at the card's own width as it is saved, so a card saved from a phone matches one saved from a desktop.

### Hero sky

Each displayed model family is one star: release order runs across the sky, and Intelligence sets its height and size. Both are scaled across the full model population, so filters remove stars without moving the rest. Stars carry their provider's tint, and filter changes redraw the sky from the displayed models.

The mapping stays implicit, so the hero carries no key or legend. Pointing near a star identifies it with a flare and a card giving name, provider, Intelligence, and release date; hovering a role in the register flares its star the same way, and clicking an identified star opens its model sheet. The cursor never changes, and no ring or sight marks a star. Exploration is mouse-only, while the register and leaderboard carry the same information accessibly.

Frontier role stars carry rays and a small name placed clear of other stars, names, the title, and the register, kept inside the window and fading as the camera scopes in; a name with no room gives way rather than cover something. Names are hidden on touch phones but stay in a narrowed desktop window. Role text stays neutral and factual, with a tight night edge so it holds where the register crosses the rim.

### Methodology

The documentation sits under a still CSS sky, sparse stars over the dashboard's night gradient with a faint dawn at the top, in both themes. The title opens on the sky in the region-name style, scaled to the documentation frame and taking the hero's leading below 1100px, where long titles wrap. One opaque plane holds the document strip, the docked navigation, and the Markdown text, so reading stays one surface; the full strip shows at every width, scrolling sideways to keep the current document in view. Document tables read in the body face under measurement-label headers, and prose, tables, and figures share one right edge. The current document is lit by the selection star, and the on-page outline is the rail's flight path turned vertical, with one star gliding with the scroll.

Navigation has two modes, shown or hidden, switched by an icon toggle at the start of the document strip and remembered across documents. Shown navigation sits beside the text from 720px and stacks above it on phones; it never overlays the page as a drawer. Phones start hidden, since stacked navigation would push the text below the fold. The frame fits the navigation beside one reading column of up to 860px and never changes when the navigation toggles: hidden navigation hands its space to the text, and every extra pixel of window width is sky.

## Do's and Don'ts

### Do:

- **Do** keep provider colours and icons on every model mark, in both themes.
- **Do** keep analytical copy in the planes factual and explicit about how values map to marks; only the hero sky's mapping stays implicit.
- **Do** give every dashboard region the shared content width.
- **Do** preserve the wide leaderboard, chart axes, the frontier register, both themes, and one sky drawn from the displayed models.

### Don't:

- **Don't** add a key, legend, or explanatory caption to the hero, or name stars beyond the frontier roles.
- **Don't** show a placeholder sky or part of the page before the sky can draw.
- **Don't** sweep the opening in one direction or make the rim's light follow the stars as they light.
- **Don't** restyle the horizon with glints, floating airglow arcs, limb bands, or banded stipple.
- **Don't** pan the whole sky with the pointer; pointer effects stay local to nearby stars.
- **Don't** mark models with rings, sights, or reticles, change the cursor to a crosshair, or follow it with a plain white circle.
- **Don't** tint planes toward the sky, let the sky show through data, or trade table and chart density for decorative whitespace.
- **Don't** use horizon colours to identify a model or provider, replace provider identity with one accent colour, or give role text generic blue or a selected-row wash.
