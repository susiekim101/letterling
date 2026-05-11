import type { Metadata } from 'next'
import { Quicksand, Nunito } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'

const quicksand = Quicksand({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-quicksand',
})

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-nunito',
})

export const metadata: Metadata = {
  title: 'Letterling — Handwriting practice for kindergarten',
  description:
    'Letterling helps young learners practice writing their names with friendly real-time feedback.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${quicksand.variable} ${nunito.variable}`}>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
