import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';

export const apolloClient = new ApolloClient({
  link: new HttpLink({
    uri: process.env.NEXT_PUBLIC_STASH_GRAPHQL,
    credentials: 'same-origin',                // include cookies if you need auth
    headers: {
      ApiKey: process.env.NEXT_PUBLIC_STASH_API,
    },
  }),
  cache: new InMemoryCache(),
});
