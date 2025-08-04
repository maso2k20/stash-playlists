import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';

export const apolloClient = new ApolloClient({
  link: new HttpLink({
    uri: process.env.NEXT_PUBLIC_STASH_GRAPHQL, // e.g. "/api/stash-graphql"
    credentials: 'same-origin',                // include cookies if you need auth
    headers: {
      // If you’re proxying via Next.js API route, you don’t need ApiKey here.
      // Otherwise you could set: ApiKey: process.env.NEXT_PUBLIC_API_KEY
    },
  }),
  cache: new InMemoryCache(),
});
