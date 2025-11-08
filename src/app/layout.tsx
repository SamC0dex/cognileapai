import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from 'sonner'
import { AppWrapper } from '@/components/app-wrapper'
import { ErrorManagementProvider } from '@/components/error-management/provider'
import { AuthProvider } from '@/contexts/auth-context'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CogniLeap - Transform PDFs into Study Materials',
  description: 'Upload PDFs and generate study guides, summaries, and notes powered by AI',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head></head>
      <body className={inter.className} suppressHydrationWarning>
        <AppWrapper>
          <AuthProvider>
            <ErrorManagementProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="dark"
                enableSystem={false}
                disableTransitionOnChange
                storageKey="cognileap-theme"
              >
                {children}
                <Toaster richColors closeButton position="top-right" />
              </ThemeProvider>
            </ErrorManagementProvider>
          </AuthProvider>
        </AppWrapper>
      </body>
    </html>
  )
}
