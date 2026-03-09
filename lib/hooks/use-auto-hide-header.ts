"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

interface UseAutoHideHeaderOptions {
  scrollContainerSelector?: string;
  thresholdPx?: number;
  topOffsetPx?: number;
  hideDistancePx?: number;
  revealDistancePx?: number;
  disabled?: boolean;
}

interface VisibilityControllerOptions {
  thresholdPx: number,
  topOffsetPx: number,
  hideDistancePx: number,
  revealDistancePx: number,
  onHiddenChange: (hidden: boolean) => void,
}

interface VisibilityController {
  update: (currentPosition: number) => void;
  reset: (currentPosition: number) => void;
}

function createVisibilityController({
  thresholdPx,
  topOffsetPx,
  hideDistancePx,
  revealDistancePx,
  onHiddenChange,
}: VisibilityControllerOptions): VisibilityController {
  let previousPosition: number | null = null;
  let hidden = false;
  let downTravel = 0;
  let upTravel = 0;

  const reset = (currentPosition: number) => {
    previousPosition = currentPosition;
    downTravel = 0;
    upTravel = 0;
    if (!hidden) return;
    hidden = false;
    onHiddenChange(false);
  };

  const update = (currentPosition: number) => {
    if (previousPosition === null) {
      previousPosition = currentPosition;
      return;
    }

    if (currentPosition <= topOffsetPx) {
      reset(currentPosition);
      return;
    }

    const delta = currentPosition - previousPosition;
    previousPosition = currentPosition;

    if (Math.abs(delta) < thresholdPx) return;

    if (delta > 0) {
      downTravel += delta;
      upTravel = 0;
      if (!hidden && downTravel >= hideDistancePx) {
        hidden = true;
        downTravel = 0;
        onHiddenChange(true);
      }
      return;
    }

    upTravel += Math.abs(delta);
    downTravel = 0;
    if (hidden && upTravel >= revealDistancePx) {
      hidden = false;
      upTravel = 0;
      onHiddenChange(false);
    }
  };

  return { update, reset };
}

function resolveScrollElement(target: EventTarget | null, selector: string): Element | null {
  if (!(target instanceof Element)) return null;
  if (target.matches(selector)) return target;
  return target.closest(selector);
}

export function useAutoHideHeader({
  scrollContainerSelector,
  thresholdPx = 8,
  topOffsetPx = 8,
  hideDistancePx = 28,
  revealDistancePx = 16,
  disabled = false,
}: UseAutoHideHeaderOptions = {}) {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);

  useEffect(() => {
    hiddenRef.current = false;
    setHidden(false);
  }, [pathname]);

  useEffect(() => {
    const onHiddenChange = (nextHidden: boolean) => {
      if (hiddenRef.current === nextHidden) return;
      hiddenRef.current = nextHidden;
      setHidden(nextHidden);
    };

    if (disabled) {
      hiddenRef.current = false;
      setHidden(false);
      return;
    }

    if (scrollContainerSelector) {
      const controllers = new WeakMap<Element, VisibilityController>();

      const getController = (element: Element): VisibilityController => {
        let controller = controllers.get(element);
        if (controller) return controller;

        controller = createVisibilityController({
          thresholdPx,
          topOffsetPx,
          hideDistancePx,
          revealDistancePx,
          onHiddenChange,
        });
        controller.reset(element.scrollTop);
        controllers.set(element, controller);
        return controller;
      };

      const onScroll = (event: Event) => {
        const element = resolveScrollElement(event.target, scrollContainerSelector);
        if (!element) return;
        getController(element).update(element.scrollTop);
      };

      document.addEventListener("scroll", onScroll, { passive: true, capture: true });
      return () => {
        document.removeEventListener("scroll", onScroll, { capture: true });
      };
    }

    const controller = createVisibilityController({
      thresholdPx,
      topOffsetPx,
      hideDistancePx,
      revealDistancePx,
      onHiddenChange,
    });
    controller.reset(window.scrollY);

    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        controller.update(window.scrollY);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [
    disabled,
    hideDistancePx,
    revealDistancePx,
    scrollContainerSelector,
    thresholdPx,
    topOffsetPx,
  ]);

  return hidden;
}
