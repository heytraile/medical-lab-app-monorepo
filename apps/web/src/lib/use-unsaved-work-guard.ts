import { useBlocker } from "@tanstack/react-router";

/**
 * Blocks in-app navigation and browser refresh/close when `enabled`.
 * Returns a resolver — when `status === "blocked"`, show a confirm UI and
 * call `proceed()` to leave or `reset()` to stay.
 */
export function useUnsavedWorkGuard(enabled: boolean) {
  return useBlocker({
    shouldBlockFn: () => enabled,
    withResolver: true,
    enableBeforeUnload: enabled,
    disabled: !enabled,
  });
}
