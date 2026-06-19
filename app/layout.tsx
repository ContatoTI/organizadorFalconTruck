import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { GroupsProvider } from './lib/GroupsContext';
import './globals.css';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'Organizador',
  description: 'Seu organizador pessoal de tarefas, finanças e metas',
  icons: {
    icon: '/favicon.ico',
    apple: '/pwa-192x192.png',
  },
  manifest: undefined,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
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
