"use client";

import { useEffect } from "react";

const OPEN_PANES = "details[data-manage-pane][open]";

/** Closes any open Manage pane when you tap outside it or press Escape, and
 * after a save. Only one pane stays open at a time. */
export default function ClosePanesOnOutsideClick() {
  useEffect(() => {
    const closePanes = (keep?: Node | null) => {
      document.querySelectorAll<HTMLDetailsElement>(OPEN_PANES).forEach((pane) => {
        if (!keep || !pane.contains(keep)) pane.open = false;
      });
    };

    const onPointerDown = (e: PointerEvent) => closePanes(e.target as Node | null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanes();
    };
    const onSubmit = (e: Event) => {
      const pane = (e.target as HTMLElement).closest<HTMLDetailsElement>("details[data-manage-pane]");
      // Close on the next tick so the form still submits with its values.
      if (pane) setTimeout(() => (pane.open = false), 0);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  return null;
}
