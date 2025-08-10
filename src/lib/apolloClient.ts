"use client";

import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";

export const apolloClient = new ApolloClient({
  link: new HttpLink({
    uri: "/api/stash-graphql",   // same-origin proxy
    credentials: "same-origin",
  }),
  cache: new InMemoryCache(),
});