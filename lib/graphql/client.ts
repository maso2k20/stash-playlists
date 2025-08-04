import { ApolloClient, InMemoryCache } from '@apollo/client';

export const apolloClient = new ApolloClient({
  uri: process.env.NEXT_PUBLIC_STASH_GRAPHQL,
  cache: new InMemoryCache(),
});
