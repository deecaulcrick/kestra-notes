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
  const [refreshTick, setRefreshTick] = useState(0);
  const noteIdRef = useRef(noteId);
  noteIdRef.current = noteId;

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

    getBacklinks(noteId)
      .then((bl) => {
        console.log("[useGraph] backlinks for", noteId, "->", bl);
        if (!cancelled) setBacklinks(bl);
      })
      .catch((err) => console.error("[useGraph] getBacklinks error:", err));

    getOutboundLinks(noteId)
      .then((ob) => { if (!cancelled) setOutbound(ob); })
      .catch((err) => console.error("[useGraph] getOutboundLinks error:", err))
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [noteId, refreshTick]);

  return { backlinks, outbound, isLoading };
}
