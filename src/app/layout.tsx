import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ApolloProvider } from '../providers/ApolloProvider';
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = { title: 'Stash Playlist App' };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ApolloProvider>
          <nav className="bg-gray-800 text-white p-4 flex gap-4">
            <Link href="/">Home</Link>
            <Link href="/actors">Actors</Link>
            <Link href="/actors/add">Add Actors</Link>
            <Link href="/about">About</Link>
          </nav>
          {children}
        </ApolloProvider>
      </body>
    </html>
  );
}
