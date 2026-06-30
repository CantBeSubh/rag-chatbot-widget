import { Toaster } from "react-hot-toast"

import { AppClerkProvider } from "./clerk-provider"
import { QueryProvider } from "./query-provider"
import { ThemeProvider } from "./theme-provider"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppClerkProvider>
      <QueryProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                // Ties directly into shadcn/ui tokens
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                fontSize: "14px",
              },
              // success: {
              //   iconTheme: {
              //     primary: "hsl(var(--primary))",
              //     secondary: "var(--primary-foreground)",
              //   },
              // },
            }}
          />
        </ThemeProvider>
      </QueryProvider>
    </AppClerkProvider>
  )
}
