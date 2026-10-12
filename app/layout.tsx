import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LLM Evaluation Engine — Production Quality Gate & Edge Shadow Telemetry',
  description: 'Production-grade LLM evaluation harness, CI/CD regression gate, and Vercel Edge shadow evaluation monitoring.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
