"use client";

import { createContext, ReactNode, useContext } from "react";

type ColorThemeContextType = {
  colorTheme: string;
};

const ColorThemeContext = createContext<ColorThemeContextType | undefined>(undefined);

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ColorThemeContext.Provider value={{ colorTheme: "blossom" }}>
      {children}
    </ColorThemeContext.Provider>
  );
}

export function useColorTheme() {
  const context = useContext(ColorThemeContext);
  if (!context) {
    throw new Error("useColorTheme must be used within ColorThemeProvider");
  }
  return context;
}
