import { useEffect, useRef, useState } from "react";
import { search, type SearchResult } from "../lib/tauri";

export function useSearch(query: string): {
  results: SearchResult[];
  isSearching: boolean;
} {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timerRef.current);

    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    timerRef.current = setTimeout(async () => {
      try {
        const res = await search(query);
        setResults(res);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 150);

    return () => clearTimeout(timerRef.current);
  }, [query]);

  return { results, isSearching };
}
