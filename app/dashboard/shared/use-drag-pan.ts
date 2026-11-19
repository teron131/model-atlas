/** Mouse panning for content wider than its view, since a mouse wheel scrolls only down: a press the owner accepts becomes a pan once it moves a few pixels sideways, so a press that stays put is still a click, and the click that ends a pan reaches nothing beneath it. Touch and trackpads keep their own sideways scroll. A pan marks its view `data-panning` straight on the element rather than through state, and keeps text from being selected by cancelling the selection rather than by a style, since rendering or restyling a whole table at the pan's start stalls it. */

import { type DragEvent, type MouseEvent, type PointerEvent, useRef } from "react";

// A press moving less than this is a click whose hand shook, not a pan.
const PAN_THRESHOLD_PX = 4;

const preventSelection = (event: Event) => event.preventDefault();

export function useDragPan({
  accepts,
  scrollLeft,
  scrollTo,
}: {
  /** Whether a press on this target may start a pan. */
  accepts: (target: Element) => boolean;
  /** The scroll a pan starts from. */
  scrollLeft: () => number;
  scrollTo: (scrollLeft: number) => void;
}) {
  const press = useRef<{ x: number; scrollLeft: number; view: HTMLElement | null } | null>(null);
  // Set when a pan ends, so the click the release fires is swallowed; the next press clears it, since a release outside the view fires no click.
  const panned = useRef(false);
  const end = () => {
    if (press.current == null) return;
    const { view } = press.current;
    panned.current = view != null;
    if (view != null) {
      delete view.dataset.panning;
      view.removeEventListener("selectstart", preventSelection);
    }
    press.current = null;
  };
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      panned.current = false;
      if (
        event.pointerType === "mouse" &&
        event.button === 0 &&
        event.target instanceof Element &&
        accepts(event.target)
      )
        press.current = { x: event.clientX, scrollLeft: scrollLeft(), view: null };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const current = press.current;
      if (current == null) return;
      // A press let go outside the view before its pan held the pointer never reports its release here, so a move with the button up ends it.
      if ((event.buttons & 1) === 0) {
        end();
        return;
      }
      const moved = event.clientX - current.x;
      if (current.view == null) {
        if (Math.abs(moved) < PAN_THRESHOLD_PX) return;
        current.view = event.currentTarget;
        current.view.dataset.panning = "";
        // Holding the pointer keeps the pan going past the view's edge and off the marks it crosses.
        current.view.setPointerCapture(event.pointerId);
        window.getSelection()?.removeAllRanges();
        current.view.addEventListener("selectstart", preventSelection);
      }
      scrollTo(current.scrollLeft - moved);
    },
    onPointerUp: end,
    onPointerCancel: end,
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (!panned.current) return;
      panned.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    // A logo or link would otherwise start the browser's own drag and cancel the pan.
    onDragStart: (event: DragEvent<HTMLElement>) => {
      if (press.current != null) event.preventDefault();
    },
  };
}
