import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { GroupsProvider } from './lib/GroupsContext';
import './globals.css';
import { DM_Sans } from "next/font/google";
import { cn } from "@/lib/utils";

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Organizador',
  description: 'Seu organizador pessoal de tarefas, finanças e metas',
  icons: {
    icon: '/favicon.ico',
    apple: '/pwa-192x192.png',
  },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={cn("font-sans", dmSans.variable)}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <GroupsProvider>
            {children}
          </GroupsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
