"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Accesibilidad de diálogos modales:
 *  - lleva el foco al primer elemento enfocable al abrir,
 *  - mantiene Tab/Shift+Tab dentro del diálogo,
 *  - cierra con Escape,
 *  - bloquea el scroll del fondo,
 *  - devuelve el foco al elemento anterior al cerrar.
 *
 * `onClose` se guarda en una ref para que el efecto no se re-ejecute (y no
 * robe el foco) en cada render del componente padre.
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableNodes(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void
): void {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = ref.current;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // Foco inicial dentro del diálogo.
    const initial = dialog ? focusableNodes(dialog)[0] ?? dialog : null;
    initial?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;

      const nodes = focusableNodes(dialog);
      if (nodes.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [ref]);
}
