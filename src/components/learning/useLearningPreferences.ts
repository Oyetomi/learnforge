import { useState, useEffect } from "react";
import {
  loadLearningPreferences,
  LEARNING_PREFERENCES_EVENT,
} from "../../services/learning/preferences";
export function useLearningPreferences() {
  const [preferences, set] = useState(loadLearningPreferences);
  useEffect(() => {
    const update = () => set(loadLearningPreferences());
    window.addEventListener(LEARNING_PREFERENCES_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(LEARNING_PREFERENCES_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return preferences;
}
