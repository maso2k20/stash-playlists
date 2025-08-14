"use client";
import React, { createContext, useContext } from "react";
import { useQuery, gql } from "@apollo/client";

const GET_STASH_TAGS = gql`
  query getStashTags {
    findTags(filter: { per_page: 10000 }) {
      tags {
        id
        name
        scene_count
        image_path
        children {
          id
          name
        }
      }
    }
  }
`;

const StashTagsContext = createContext<any>(null);

export const StashTagsProvider = ({ children }: { children: React.ReactNode }) => {
  const { data, loading, error } = useQuery(GET_STASH_TAGS);

  // You can shape the value as needed
  const stashTags = data?.findTags?.tags ?? [];

  return (
    <StashTagsContext.Provider value={{ stashTags, loading, error }}>
      {children}
    </StashTagsContext.Provider>
  );
};

export const useStashTags = () => useContext(StashTagsContext);