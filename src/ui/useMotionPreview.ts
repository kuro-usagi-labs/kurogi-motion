import { useEffect, useRef, useState } from "react";

/**
 * Keeps expensive Remotion previews dormant until they can actually be seen.
 * It also follows OS reduced-motion and pauses all previews while the window is hidden.
 */
export function useMotionPreview<T extends HTMLElement>() {
  const hostRef = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  const [nearViewport, setNearViewport] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");

  useEffect(() => {
    const element = hostRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      setNearViewport(true);
      return;
    }
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= .18),
      { threshold: [0, .18, .55] },
    );
    const preloadObserver = new IntersectionObserver(
      ([entry]) => setNearViewport(entry.isIntersecting),
      { rootMargin: "120px 0px", threshold: 0 },
    );
    visibilityObserver.observe(element);
    preloadObserver.observe(element);
    return () => {
      visibilityObserver.disconnect();
      preloadObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  return {
    hostRef,
    visible,
    hovered,
    reducedMotion,
    shouldLoad: nearViewport || hovered,
    shouldPlay: pageVisible && !reducedMotion && (visible || hovered),
    previewEvents: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocusCapture: () => setHovered(true),
      onBlurCapture: (event: React.FocusEvent<T>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(false);
      },
    },
  };
}
