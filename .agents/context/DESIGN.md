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
  body:
    fontFamily: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif'
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.58
  label:
    fontFamily: '"SFMono-Regular", "SF Mono", Menlo, Consolas, monospace'
    fontSize: "12px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "0.035em"
  detail:
    fontFamily: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif'
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  caption:
    fontFamily: '"SFMono-Regular", "SF Mono", Menlo, Consolas, monospace'
    fontSize: "11px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "0.035em"
  micro:
    fontFamily: '"SFMono-Regular", "SF Mono", Menlo, Consolas, monospace'
    fontSize: "10px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "0.035em"
  note:
    fontFamily: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif'
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.55
  data-compact:
    fontFamily: '"SFMono-Regular", "SF Mono", Menlo, Consolas, monospace'
    fontSize: "12px"
    fontWeight: 650
    lineHeight: 1.2
  document-title:
    fontFamily: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif'
    fontSize: "clamp(36px, 4vw, 46px)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  document-heading:
    fontFamily: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif'
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
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
  control: "8px"
  section: "48px"
components:
  segmented-control:
    backgroundColor: "transparent"
    textColor: "{colors.muted-light}"
    rounded: "{rounded.square}"
    padding: "10px 12px"
  data-surface:
    backgroundColor: "{colors.paper-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.research}"
---

# Design System: Model Atlas

## Overview

**Creative North Star: "Frontier Sky"**

Model Atlas is a star atlas for language models. Every displayed model is a star over a glowing planetary horizon: the newest and strongest rise highest, and the frontier roles are named like stars on a chart. Scrolling scopes the camera past the horizon into the star field, where each research region opens with its name set large on the sky over a charcoal plane holding the dense, factual tables and charts. Inside the planes the same physics holds: every frontier is drawn as a lit horizon and every leading model shines like a star. The methodology route shares the sky as a still reading page: its document title on the sky, then one research plane holding the document strip, navigation, and text.

**Key Characteristics:**

- Continuous one-column research surface
- Models as stars in the hero sky, mapped from published scores
- Provider colour and icon as persistent model identity
- Measurement typography for labels and data
- Models as round stars in the sky, in every chart, and on the leaderboard's score tracks
- Frontiers drawn as lit horizons over the region they reach
- Region names at display size on the sky, above their planes
- Opaque charcoal research planes lit along their top edge, floating in the sky

## Colors

Dark is the default: blue-charcoal research planes with chalk ink, deliberately neutral against the navy sky so every content boundary reads at a glance. Light mode keeps mineral paper planes over the same night sky. Both are real surfaces, not a darkened or inverted illustration.

### Primary

The horizon glow (cobalt, violet, rose) is the environment: the sky, panel edges, active navigation rules, and the horizons that draw analytical frontiers. Analytical marks retain provider colour as data; numerical emphasis remains ink against the surface.

### Neutral

- **Mineral Paper** (#f2f4f2): light research planes.
- **Blue Charcoal** (#0b1016): dark research planes and chart fields; never matched to the sky.
- **Carbon Ink** (#202724): primary light-mode text and structural marks.
- **Chalk Ink** (#f2f3ed): primary dark-mode text and structural marks.

### Named Rules

**Evidence Chroma Rule.** Provider colours belong to model evidence, including the provider tint of each sky star and each chart star's ring and glow. Horizon colours are confined to the environment, chrome, and frontier horizons, which mark where the data reaches and never identify a model or provider; analytical selection and orientation marks inside the data remain ink.

**Provider Identity Rule.** Provider colours are data and stay attached to every model mark, star, label, icon, and row.

**Shared Width Rule.** The dashboard header, hero text, research navigation, leaderboard, and chart panels use the same main content width. Only the sky itself is full-bleed.

## Typography

**Display Font:** Avenir Next with Segoe UI and Helvetica fallbacks
**Body Font:** Avenir Next with Segoe UI and Helvetica fallbacks
**Label/Mono Font:** SFMono-Regular with Menlo and Consolas fallbacks

**Character:** Wide, calm sans-serif headings establish the field; compact monospaced labels carry measurements, parameters, and state.

### Hierarchy

- **Display** (500, clamp(64px, min(15.2vw, 26svh), 232px), 0.98): the hero title in two lines with a fixed stagger, the second indented 1.4em, so it keeps one shape at every width and aspect ratio and only scales; just enough leading that the first line's descenders clear the second.
- **Region** (500, clamp(54px, 8.8vw, 136px), 0.86, -0.054em): research region names, set on the sky above their planes; exports reduce them to 30px on the surface.
- **Readout** (24px, tabular): the Pareto summary's median and the Timeline's catalogue entry, one size so the two figures' headline numbers agree.
- **Body** (500, 1rem, 1.58): factual explanation with a maximum measure near 68ch.
- **Data** (600, 0.8125rem, tabular): scores, prices, ranks, and model metadata.
- **Label** (650, 0.75rem, 0.035em, uppercase): parameters, axes, and compact controls.
- **Caption** (650, 0.6875rem, 0.035em, uppercase): secondary annotations.
- **Micro** (650, 10px, 0.035em, uppercase): the compact-width floor for captions and dense rail annotations. Nothing shrinks below it.
- **Note** (500, 15px): panel copy and tooltip prose.
- **Model name** (600, 15px; 14px on phones): leaderboard model names and ranks, the table's primary reading line.
- **Data compact** (650, 12px, tabular): chips and secondary readouts.
- **Model identifier** (500, 11px, mono): the slug beneath each leaderboard model name.
- **Document title** (500, 36–72px scaled to the documentation frame, -0.054em): the methodology title, set on the sky in the region-name style.
- **Document heading / subheading** (600, 24px / 18px): methodology sections inside the plane.

## Layout

The dashboard stays one column. The hero fills the first viewport on the sky with only the staggered "Mapping / Frontiers" title, the star-chart key, and the frontier register of six roles; no lede, status line, or controls compete with the sky. A persistent research index follows, connecting three numbered regions: Models, Pareto, and Timeline. The index numbering is real and shared: each region opens on the sky with its name at display size and the same two-digit ordinal hanging at its cap height, with the region's capture and link actions at the far edge. One module owns the sequence, so the rail and the heads cannot disagree about it. The region's opaque plane follows directly below its name; the leaderboard plane and one analytical plane per row continue down the page, separated by generous gaps of sky. Content may become horizontally scrollable where its data density requires it, but the page itself must not overflow. Below 760px, labels and controls reflow while the model evidence remains visible.

## Elevation & Depth

One fixed WebGL layer renders the sky behind the dashboard: a dark stippled horizon mound with a cobalt-to-violet-and-rose rim glow, wrapping dust stars, the model stars with diffraction rays on the frontier roles, a flare on the star being explored, and faint nebulae deeper in. Beneath it, CSS draws the same hero horizon, so loading and browsers without WebGL show the same composition and the field fades in without a change of scene; the shader's horizon therefore starts at full strength and only the stars play the opening. Fine film grain sits above both. The camera starts at the hero composition; scrolling tilts it up and pushes it forward as if leaving the planet: the horizon tightens from a shallow arc into a tighter limb while it is still in view, then pans down and out as the stars spread with true perspective parallax. The arc is proportioned to the viewport, so every width shows the same starting curve and the same tightening. Past the hero it continues a slow flight that ends before the nearest star.

Research planes are opaque so model and chart contrast never depends on the sky: blue charcoal, a fine edge, a horizon-gradient line along the lit top edge, and a deep shadow with a soft violet bloom. The sticky research index is the one translucent surface. Controls and data cells remain flat.

The sky renders at 24 FPS in the hero and 12 FPS past it, always at full rate while scrolling, with a capped pixel ratio. Ambient twinkle stops for hidden documents. Reduced motion keeps the hero composition still: no camera travel, parallax, or twinkle. Graph exports omit the decorative edge, outer shadow, border, and rounding.

## Shapes

Research surfaces have sharp corners; controls remain square and compact provider icons retain their existing small radius. Models are round stars everywhere: in the sky, as chart points, and as the marker on each leaderboard score track. A chart star's area tracks the mean of the model's available scores; the hover card and leaderboard carry the individual scores.

The backend score contract remains the source of truth for Intelligence, Agentic, Speed, and Value. Analytical plots translate those fetched scores only inside their star-mark geometry module. The sky uses its own star adapter; it does not depend on graph geometry or introduce a parallel frontend score model.

## Components

### Buttons

- **Shape:** square, borderless or 1px ruled.
- **Primary:** the selected option turns full ink and is lit by a small selection star beneath it, the leaderboard's score star in horizon-violet light, with a soft violet bloom around the star that faintly lights its label; the bloom belongs to the star, so no control box clips it. Hover previews a dimmer star. No underline rules, tracks, or pills mark selection.
- **Hover / Focus:** strengthen foreground and show a visible 2px focus ring without changing layout.

### Chips

- **Style:** compact ruled measurement controls with provider icon, label, and count.
- **State:** provider colour remains visible in both selected and unselected states.

### Cards / Containers

- **Corner Style:** square on complete research regions and within them.
- **Background:** opaque theme surface to preserve model and chart contrast, distinct in hue from the sky.
- **Shadow Strategy:** shared deep elevation with a soft violet bloom along the lit edge.
- **Border:** one fine enclosing edge, a horizon-gradient line along the top, and internal measurement rules.
- **Floating surfaces:** hover cards, column tooltips, and filter menus share the horizon-gradient top line.

### Inputs / Fields

- **Style:** transparent field with a 1px baseline or rule.
- **Focus:** stronger rule plus the shared focus ring.

### Navigation

Route and section navigation use measurement labels. The research rail is a flight path: a hairline track along its foot with a waypoint under each region link and a selection star that travels with the scroll, approaching the first region from the track start and running on through the last. The path already flown is lit in horizon light and passed waypoints turn violet; no tab underline, divider, pill, or filled background marks the current region. Region names hang the shared ordinal at their cap height.

### Methodology

The documentation sits under a still sky rather than the WebGL field: sparse CSS stars over the dashboard's night gradient with a faint dawn at the top, in both themes. The document title opens on the sky; one opaque research plane, lit along its top edge, holds the document strip, the docked navigation, and the Markdown text, so reading stays one uninterrupted surface. The current document is lit by the selection star and its bloom. The on-page outline is the research rail's flight path turned vertical: a track with a waypoint beside each section, the path already read lit in horizon light, and one star that glides continuously with the scroll and rests on the last section at the page's end; side rails keep only the star's tight glow so their scroll boxes never clip it. Document tables read in the body face with measurement-label headers. The documentation has exactly two modes, navigation shown or hidden, switched by the icon-only navigation toggle at the start of the document strip at every width and remembered across documents. Shown navigation sits beside the text from 720px and stacks above it on phones; it never overlays the page as a drawer. The full document strip shows at every width, scrolling sideways when it does not fit and keeping the current document in view. The frame is sized for the navigation beside one reading column of up to 860px and centred, and it never changes when the navigation is toggled: hidden navigation hands its space to the text. The header, title, and plane share that frame, so every extra pixel of width is sky rather than empty plane. The title scales with the frame, not the window, so it keeps one line wherever it fits. Prose, tables, and figures fill the column and end at the same right edge just inside the plane.

### Frontier Sky

The hero sky is the signature. Each displayed model family is one star: release order runs across the sky, and Intelligence sets height above the horizon and brightness. Both are scaled across the full model population, so filters remove stars without moving the rest and a lone filtered model keeps its true place. Stars carry their provider's tint. Filter changes redraw the sky from the displayed models.

A star-chart key above the register states the mapping in plain words: each star is a model, higher is more intelligent, further right is newer, and stars with rays hold frontier roles. In the hero, pointing near a star identifies it with a flare and a card giving name, provider, Intelligence, and release date; hovering a role in the register flares its star the same way and extends the role's provider mark. The cursor never changes, and no ring or sight marks a star. Exploration is decorative and mouse-only; the register and leaderboard carry the same information accessibly.

The frontier register shows the established roles in order: Best Intelligence, Best Agentic, Another Lab, Best Open Weight, Pareto Balance, and Pareto Value. Existing role selection and Pareto scope remain unchanged. The role models' stars carry diffraction rays and a small chart label placed to avoid other labels and stars; the labels are decorative, hidden on phones, and fade as the camera scopes in, while the register carries the same roles accessibly. Role text remains neutral and factual, with no selected-row wash or model selector. Where the hero is tall, as on phones and portrait tablets, the key and register cross the lit horizon, so their text carries a soft night halo to stay legible over the rim and stipple.

### Analytical Marks

Frontiers in the Pareto and Timeline charts are drawn as the sky's horizon: a white-hot rim over a horizon-gradient edge, extended at the outermost model's height to the plot edge on the side the reached region continues, with horizon light and stipple along its underside and a faint wash over the region it reaches. Every model the frontier outperforms sits inside that lit region. The Timeline's record frontier joins each record directly to the next, reading as one rising ridge rather than a staircase. Chart stars echo the leaderboard's score stars without blooming: a lit centre inside a solid ring of the provider colour, crisp enough to read hue and separate neighbours in dense clusters. Only frontier models and the selected model glow, tightly and faintly, from one softly blurred layer beneath the marks, so the effect costs a single filter per chart. Index-only Timeline models remain hollow rings with dark centres, and in the light theme stars are solid with fainter glows. Leaderboard ranks are set in the display face at the model name's 15px size, bright for the leading three; the rank column's header stays a measurement label like every other header. Leaderboard score cells keep the number primary, set at a heavier 700 weight so the readout carries the row. Every leaderboard meter sits directly beneath its number at every width, so the readout carries the row and columns stay narrow. Score tracks run 0–100 with the model's provider-colour star at its score and a trail that brightens toward it; tracks share one width and a half-way tick at 50, so reading down a column still shows the gaps and clusters between models. Resource ratios read on their own log track, rounded to two significant figures: a tick marks the 1× median, and a solid bar in the score trail's provider colour grows from it toward the model's ratio. Bars use one fixed doubling scale rather than any column's spread, so a wide tail never shrinks everyone else: on a 60px track, a little longer than the score tracks, a bar's length follows the doubling count raised to 0.6 and reaches the end at 16× or 1/16×, so a 26% saving still reads as a bar, near-median noise stays a stub, overspends of 6× and 11× draw visibly apart, and the same factor draws the same length in every column; no star marks a ratio, so the Cost, Time, and Tokens columns stay apart from the score stars. The Cost and Time headers carry the Pareto axis's down arrow, since lower is cheaper or faster there; Tokens carries none because fewer tokens are not plainly better. Every other measured amount, the blended and input/output prices, throughput, latency, end-to-end time, context, and each benchmark's own cost, time, and token columns, keeps its value as the readout and draws the same bar against that column's median across the table, with the ratio on hover; position always means amount, never goodness. The leaderboard is wide enough that adjacent columns read as one undifferentiated band, so hairline rules close the measurement groups the columns actually form: the four scores, then the price and context pair, then benchmark evidence. These rules close groups; they never box a single column. Chart hover cards use a medium-weight model name and a neutral logo frame without provider-colour glow or shadow.

Row hover carries a faint trace of the row's own provider colour blended into the ink hover wash (6% mix), extending the signature's material-as-identity idea into the leaderboard without introducing a second hue: the tint is always the model's own data colour, never a decorative accent.

Each analysis reads as a figure. Its chart leads the plane; the axis choices sit on the axes they control, with Pareto performance above the y-axis beside the score summary and resources centred beneath the x-axis, and the Timeline's view choices above its plot. Controls, legend, readout, and caption share the graph's own width and edges, axes included, rather than the plane's or the plot grid's. The region's description, the evidence explanation, and the axis note become a caption beneath the chart, as in a published figure, followed by the evidence disclosure.

The Timeline's selected model reads as a star-catalogue entry: its ringed provider star, name, Intelligence Index, release date, and evidence support at the readout size shared with the Pareto summary, over measurement-type labels. The Timeline overview strip carries the same frontier as a small horizon, so its window frames a stretch of it.

Box-and-whisker summaries behave as compact measuring instruments. The median is dominant; the label and population remain quiet; the range and quartile box stay hairline, and the ink median stays explicit. Dense two-sided rankings retain their readable intrinsic width on compact screens and become horizontally scrollable with keyboard access rather than shrinking their labels.

## Do's and Don'ts

### Do:

- **Do** preserve the wide leaderboard, box plots, chart axes, methodology routes, provider icons, and provider colours.
- **Do** preserve light and dark themes, the frontier-role register, and one sky responsive to the displayed models.
- **Do** keep analytical copy factual and explicit about score-to-visual mappings, including how stars are placed.

### Don't:

- **Don't** apply generic blue text or selected-row highlighting to the model-role information, or use different outer widths for dashboard regions.
- **Don't** replace provider identity with one generic accent colour, or use horizon colours to identify a model or provider.
- **Don't** let the sky show through data surfaces or trade table and chart density for decorative whitespace.
- **Don't** use a plain white cursor circle as an interaction effect, change the cursor to a crosshair, or mark models with rings, sights, or reticles.
