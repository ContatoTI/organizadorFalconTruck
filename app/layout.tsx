import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { GroupsProvider } from './lib/GroupsContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'Organizador',
  description: 'Seu organizador pessoal de tarefas, finanças e metas',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
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
