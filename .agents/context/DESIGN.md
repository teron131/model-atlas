---
name: Model Atlas
description: Live model evidence rendered as a continuous research instrument
colors:
  paper-light: "#efeee9"
  paper-dark: "#0b1016"
  ink-light: "#151713"
  ink-dark: "#f2f3ed"
  muted-light: "#5f665d"
  muted-dark: "#bbc1b7"
  signal: "#d8ff45"
typography:
  display:
    fontFamily: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif'
    fontSize: "clamp(58px, 6.4vw, 92px)"
    fontWeight: 620
    lineHeight: 0.9
    letterSpacing: "-0.04em"
  body:
    fontFamily: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif'
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.58
  label:
    fontFamily: '"SFMono-Regular", "SF Mono", Menlo, Consolas, monospace'
    fontSize: "11px"
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
    fontSize: "10px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "0.035em"
rounded:
  square: "0"
  icon: "3px"
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
    backgroundColor: "{colors.paper-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.square}"
---

# Design System: Model Atlas

## Overview

**Creative North Star: "Living Evidence Field"**

Model Atlas behaves like a research instrument whose measured evidence also becomes its material. The dashboard is one continuous light or dark field: the generative signature, controls, charts, table, and methodology are regions of the same page rather than independent cards. Expression is concentrated in the signature while the analytical surfaces remain dense, factual, and easy to audit.

**Key Characteristics:**

- Continuous one-column research surface
- Provider colour and icon as persistent model identity
- Measurement typography for labels and data
- Four-score quadrilateral silhouettes in analytical plots
- Flat fields separated by rules, spacing, and tonal shifts

## Colors

Light mode uses a mineral paper field; dark mode uses a blue-charcoal field. Both are real page backgrounds, not a darkened or inverted illustration.

### Primary

- **Signal Lime** (#d8ff45): active material mode, selected instrument state, and sparse orientation marks.

### Neutral

- **Mineral Paper** (#efeee9): light page, signature, and chart field.
- **Blue Charcoal** (#0b1016): dark page, signature, and chart field.
- **Carbon Ink** (#151713): primary light-mode text and structural marks.
- **Chalk Ink** (#f2f3ed): primary dark-mode text and structural marks.

### Named Rules

**Provider Identity Rule.** Provider colours are data and stay attached to every model mark, label, icon, row, and signature fragment.

**Continuous Field Rule.** The signature never sits in a bordered hero card or separate image frame.

## Typography

**Display Font:** Avenir Next with Segoe UI and Helvetica fallbacks
**Body Font:** Avenir Next with Segoe UI and Helvetica fallbacks
**Label/Mono Font:** SFMono-Regular with Menlo and Consolas fallbacks

**Character:** Wide, calm sans-serif headings establish the field; compact monospaced labels carry measurements, parameters, and state.

### Hierarchy

- **Display** (620, clamp(58px, 6.4vw, 92px), 0.9): first-view signature title only.
- **Headline** (600, clamp(32px, 3.35vw, 52px), 0.95): analytical section titles.
- **Body** (500, 1rem, 1.58): factual explanation with a maximum measure near 68ch.
- **Data** (600, 0.8125rem, tabular): scores, prices, ranks, and model metadata.
- **Label** (650, 0.6875rem, 0.035em, uppercase): parameters, axes, and compact controls.
- **Caption** (650, 0.625rem, 0.035em, uppercase): modes, navigation, and secondary annotations; never shrink below 9px at compact widths.

## Layout

The dashboard stays one column. A full-width signature leads, followed by a persistent research index connecting five numbered regions: model leaderboard, Pareto Frontier, price efficiency, frontier benchmarks, and interaction matrix. Global controls, the wide leaderboard, and one analytical panel per row continue below it. Content may become horizontally scrollable where its data density requires it, but the page itself must not overflow. Desktop composition uses generous lateral breathing room; below 760px, labels and controls reflow while the model evidence remains visible.

## Elevation & Depth

The system is flat by default. Depth comes from real background changes, opacity, provider-colour layering, and 1px rules. Shadows are reserved for floating tooltips and cursor-following inspection states.

## Shapes

Corners stay square. Compact provider icons may retain their existing small radius. Model profiles use quadrilaterals on a fixed compass: Intelligence up, Agentic right, Speed left, Value down. Intelligence and Value form the primary vertical opposition. Their area represents overall four-score strength; asymmetry represents the score profile.

The backend score contract remains the source of truth for Intelligence, Agentic, Speed, and Value. Analytical plots translate those fetched scores only inside their quadrilateral geometry module. Signature materials use a separate renderer adapter; they do not depend on graph geometry or introduce a parallel frontend score model.

## Components

### Buttons

- **Shape:** square, borderless or 1px ruled.
- **Primary:** selected state uses the signal colour or a full ink inversion when contrast requires it.
- **Hover / Focus:** strengthen foreground and show a visible 2px focus ring without changing layout.

### Chips

- **Style:** compact ruled measurement controls with provider icon, label, and count.
- **State:** provider colour remains visible in both selected and unselected states.

### Cards / Containers

- **Corner Style:** square.
- **Background:** continuous page field or a restrained tonal step.
- **Shadow Strategy:** none at rest.
- **Border:** one dividing rule, never a full rounded card outline.

### Inputs / Fields

- **Style:** transparent field with a 1px baseline or rule.
- **Focus:** stronger rule plus the shared focus ring.

### Navigation

Route and material-mode navigation use measurement labels. Active mode receives a short signal-colour rule rather than a pill.

### Model Signature

Evidence Field, Phase Ledger, and Signal Type coexist as three coequal signature modes; none is the master renderer or a replacement for another. The same normalized parameter object drives all three. Phase Ledger blends provider pigments continuously where model fields overlap rather than assigning hard colour territories. Pointer input produces diffusion, waves, refraction, or shear; it never draws a cursor spotlight.

The five model roles always appear in this order: highest Intelligence, highest Agentic, another unused model from the Intelligence top three, highest-Intelligence open-weight model, and the cheapest model at or above the 80th Intelligence percentile. Reserve distinct role winners first. When a role is unavailable or overlaps an earlier winner, fill it with the highest unused Intelligence top-five model and label its exact rank. Role selection changes labels and model choice, not material behavior.

### Analytical Marks

Leaderboard score cells keep the number primary. A one-pixel provider-colour line and diamond sit directly beneath it and share its right edge. Chart hover cards use a medium-weight model name and a neutral logo frame without provider-colour glow or shadow.

Box-and-whisker summaries behave as compact measuring instruments. The median is dominant; the label and population remain quiet; the range, quartile box, and signal-colour median stay hairline and explicit. Dense two-sided rankings retain their readable intrinsic width on compact screens and become horizontally scrollable with keyboard access rather than shrinking their labels.

## Do's and Don'ts

### Do:

- **Do** preserve the wide leaderboard, box plots, chart axes, methodology routes, provider icons, and provider colours.
- **Do** use real light and dark backgrounds and redraw the material from current filtered model data.
- **Do** keep analytical copy factual and explicit about score-to-visual mappings.

### Don't:

- **Don't** place the signature inside a rounded card, framed image, or glow box.
- **Don't** replace provider identity with one generic accent colour.
- **Don't** trade table or chart density for decorative whitespace.
- **Don't** use a plain white cursor circle as an interaction effect.
