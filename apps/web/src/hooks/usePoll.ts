import { useEffect, useRef } from "react";

export function usePoll(callback: () => void | Promise<void>, intervalMs: number) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    let inFlight = false;
    const tick = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        await saved.current();
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), intervalMs);
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
}
