import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

export const ThemeToggle = React.forwardRef<
  HTMLButtonElement,
  { className?: string }
>(function ThemeToggle({ className }, ref) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <Button
        ref={ref}
        variant="ghost"
        size="icon"
        className={className}
        aria-label="Theme"
      >
        <Sun className="size-4" />
      </Button>
    );
  }
  const dark = (resolvedTheme ?? theme) === "dark";
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className={className}
      aria-label="Toggle theme"
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
});
