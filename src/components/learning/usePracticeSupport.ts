import { useEffect, useState } from "react";
import { PRACTICE_SUPPORT_EVENT, visualSupportFor } from "../../services/learning/preferences";

export function usePracticeSupport(checkId: string) {
  const [, update] = useState(0);
  useEffect(() => {
    const refresh = () => update((n) => n + 1);
    window.addEventListener(PRACTICE_SUPPORT_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(PRACTICE_SUPPORT_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, [checkId]);
  return visualSupportFor(checkId);
}
