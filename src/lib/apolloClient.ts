import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';

const graphqlUrl = `${process.env.STASH_SERVER?.replace(/\/$/, '')}/graphql`;

export const apolloClient = new ApolloClient({
  link: new HttpLink({
    uri: graphqlUrl,
    credentials: 'same-origin',                // include cookies if you need auth
    headers: {
      // If you’re proxying via Next.js API route, you don’t need ApiKey here.
      // Otherwise you could set: ApiKey: process.env.NEXT_PUBLIC_API_KEY
    },
  }),
  cache: new InMemoryCache(),
});
