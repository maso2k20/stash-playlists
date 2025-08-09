'use client';  // this file runs in the browser

import { ApolloProvider as Provider } from '@apollo/client';
import { apolloClient } from '../lib/apolloClient';
import { ReactNode } from 'react';

export function ApolloProvider({ children }: { children: ReactNode }) {
  return <Provider client={apolloClient}>{children}</Provider>;
}
