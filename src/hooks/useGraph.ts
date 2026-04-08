import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  getBacklinks,
  getOutboundLinks,
  type BacklinkNote,
  type OutboundLink,
} from "../lib/tauri";

interface GraphData {
  backlinks: BacklinkNote[];
  outbound: OutboundLink[];
  isLoading: boolean;
}

export function useGraph(noteId: string | null): GraphData {
  const [backlinks, setBacklinks] = useState<BacklinkNote[]>([]);
  const [outbound, setOutbound] = useState<OutboundLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Bump this to force a re-fetch without changing noteId.
  const [refreshTick, setRefreshTick] = useState(0);
  const noteIdRef = useRef(noteId);
  noteIdRef.current = noteId;

  // Re-fetch whenever the file watcher signals a change.
  useEffect(() => {
    const unlisten = listen("notes://changed", () => {
      setRefreshTick((t) => t + 1);
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    if (!noteId) {
      setBacklinks([]);
      setOutbound([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    Promise.all([getBacklinks(noteId), getOutboundLinks(noteId)])
      .then(([bl, ob]) => {
        if (cancelled) return;
        setBacklinks(bl);
        setOutbound(ob);
      })
      .catch(() => {
        if (!cancelled) {
          setBacklinks([]);
          setOutbound([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [noteId, refreshTick]);

  return { backlinks, outbound, isLoading };
}
