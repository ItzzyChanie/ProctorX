import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "proctorx-theme";

/**
 * Toggles a `.dark` class on <html>, matching the `darkMode: 'class'` Tailwind config
 * from tailwind.tokens.ts. Persists the choice in localStorage.
 */
export function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) return saved === "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle("dark", dark);
    window.localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  const toggleDark = useCallback(() => setDark((d) => !d), []);

  return { dark, toggleDark };
}
