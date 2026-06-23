"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}>({ theme: "light", toggle: () => {}, setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const stored = (localStorage.getItem("hgs-theme") as Theme | null) ?? null;
    const prefersDark =
      window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    const initial: Theme = stored ?? (prefersDark ? "dark" : "light");
    applyTheme(initial);
    setThemeState(initial);
  }, []);

  function applyTheme(t: Theme) {
    document.documentElement.classList.toggle("dark", t === "dark");
  }

  function setTheme(t: Theme) {
    applyTheme(t);
    localStorage.setItem("hgs-theme", t);
    setThemeState(t);
  }

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

/** Inline script to set the theme class before paint (prevents FOUC). */
export const themeScript = `(function(){try{var t=localStorage.getItem('hgs-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;
