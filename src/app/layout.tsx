import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gogroup Ops AI | Torre de Controle & Agente Executor de Exce??es",
  description: "Prioriza??o financeira e resolu??o aut?noma de exce??es operacionais Gocase & GoBeaut?",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
