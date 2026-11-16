import { themesConfig } from "@/components/templates/notio/notio-themes";
import { ThemeVariables } from "@/components/theme/theme-variables";
import { ColorThemeProvider } from "@/utils/context/color-theme-context";
import { ThemeProvider } from "@/utils/providers/theme-provider";
import type { Metadata } from "next";
import { Aleo } from "next/font/google";
import "./index.css";

const aleo = Aleo({ subsets: ["latin"], variable: "--font-notio-aleo" });
const notioSansFont =
  '-apple-system, BlinkMacSystemFont, "San Francisco", "Helvetica Neue", Helvetica, ui-sans-serif, sans-serif';

export const metadata: Metadata = {
  title: "Synqui: solve today's case inside generated film",
  description:
    "Synqui is a daily mystery on iPhone that you solve inside real-time generated film. Tap what glows, watch the clue play, and answer in five moves.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${aleo.variable} min-h-screen bg-background text-foreground`}
        style={{ fontFamily: notioSansFont }}
      >
        <div
          className={`${aleo.variable} min-h-screen bg-background text-foreground`}
          style={{ fontFamily: notioSansFont }}
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <ColorThemeProvider>
              <ThemeVariables themesConfig={themesConfig} />
              {children}
            </ColorThemeProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  );
}
