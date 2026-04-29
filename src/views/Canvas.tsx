import { useEffect, useMemo, useRef, useState } from "react";
import { Grip, MoveDiagonal2, Plus, Search, ZoomIn, ZoomOut } from "lucide-react";
import {
  getBacklinks,
  getCanvasBoardState,
  openNoteWindow,
  saveCanvasCamera,
  saveCanvasPosition,
  type CanvasBoard,
  type CanvasBoardState,
  type CanvasPosition,
} from "../lib/tauri";
import { useNoteStore } from "../store/noteStore";
import "./Canvas.css";

type Camera = {
  x: number;
  y: number;
  scale: number;
};

type CardPosition = {
  noteId: string;
  x: number;
  y: number;
  width: number;
  zIndex: number;
};

type RelationshipEdge = {
  id: string;
  sourceId: string;
  targetId: string;
};

type DragState =
  | { kind: "pan"; startX: number; startY: number; originX: number; originY: number }
  | { kind: "card"; noteId: string; startX: number; startY: number; originX: number; originY: number };

const DEFAULT_CARD_WIDTH = 320;
const GRID_GAP_X = 360;
const GRID_GAP_Y = 240;

export function CanvasView() {
  const notes = useNoteStore((s) => s.notes);
  const createNoteInStore = useNoteStore((s) => s.createNote);
  const workspace = useNoteStore((s) => s.workspace);
  const [camera, setCamera] = useState<Camera>({ x: 120, y: 80, scale: 1 });
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, CardPosition>>({});
  const [positionsLoaded, setPositionsLoaded] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [edges, setEdges] = useState<RelationshipEdge[]>([]);
  const dragStateRef = useRef<DragState | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  function getNextZIndex(items: Record<string, CardPosition>) {
    return Object.values(items).reduce((max, item) => Math.max(max, item.zIndex), 0) + 1;
  }

  const boards = useMemo<CanvasBoard[]>(() => {
    const uniqueTags = Array.from(new Set(notes.flatMap((note) => note.tags)))
      .sort((a, b) => a.localeCompare(b));

    return [
      { id: "main", name: "Main" },
      ...uniqueTags.map((tag) => ({ id: `tag:${tag}`, name: `#${tag}` })),
    ];
  }, [notes]);

  useEffect(() => {
    if (!workspace) return;

    const storageKey = `canvas-active-board:${workspace.id}`;
    const storedBoardId = localStorage.getItem(storageKey);
    const nextBoardId = boards.some((board) => board.id === storedBoardId)
      ? storedBoardId
      : "main";
    setActiveBoardId(nextBoardId);
  }, [boards, workspace?.id]);

  useEffect(() => {
    if (!workspace || !activeBoardId) return;
    localStorage.setItem(`canvas-active-board:${workspace.id}`, activeBoardId);
  }, [workspace?.id, activeBoardId]);

  useEffect(() => {
    if (!activeBoardId) return;

    setPositionsLoaded(false);
    setSelectedNoteId(null);
    setPositions({});

    void getCanvasBoardState(activeBoardId)
      .then((state: CanvasBoardState) => {
        setCamera({
          x: state.camera_x,
          y: state.camera_y,
          scale: state.camera_scale,
        });
        setPositions(
          Object.fromEntries(
            state.positions.map((item: CanvasPosition) => [
              item.note_id,
              { noteId: item.note_id, x: item.x, y: item.y, width: item.width || DEFAULT_CARD_WIDTH, zIndex: item.z_index || 0 },
            ]),
          ),
        );
      })
      .finally(() => setPositionsLoaded(true));
  }, [activeBoardId]);

  const boardNotes = useMemo(() => {
    if (!activeBoardId || activeBoardId === "main") return notes;
    if (!activeBoardId.startsWith("tag:")) return notes;

    const tagName = activeBoardId.slice(4);
    return notes.filter((note) => note.tags.includes(tagName));
  }, [activeBoardId, notes]);

  useEffect(() => {
    if (!positionsLoaded || !activeBoardId) return;
    const missingNotes = boardNotes.filter((note) => !positions[note.id]);
    if (missingNotes.length === 0) return;

    const additions: Record<string, CardPosition> = {};
    const baseIndex = Object.keys(positions).length;

    missingNotes.forEach((note, index) => {
      const col = (baseIndex + index) % 4;
      const row = Math.floor((baseIndex + index) / 4);
      additions[note.id] = {
        noteId: note.id,
        x: col * GRID_GAP_X,
        y: row * GRID_GAP_Y,
        width: DEFAULT_CARD_WIDTH,
        zIndex: baseIndex + index + 1,
      };
    });

    setPositions((prev) => ({ ...prev, ...additions }));
    void Promise.all(
      Object.values(additions).map((item) =>
        saveCanvasPosition(activeBoardId, item.noteId, item.x, item.y, item.width, item.zIndex),
      ),
    );
  }, [activeBoardId, boardNotes, positions, positionsLoaded]);

  useEffect(() => {
    if (!positionsLoaded || !activeBoardId) return;

    const handle = window.setTimeout(() => {
      void saveCanvasCamera(activeBoardId, camera.x, camera.y, camera.scale);
    }, 180);

    return () => window.clearTimeout(handle);
  }, [activeBoardId, camera, positionsLoaded]);

  function bringCardToFront(noteId: string) {
    if (!activeBoardId) return;
    const current = positions[noteId];
    if (!current) return;

    const nextZIndex = getNextZIndex(positions);
    if (current.zIndex >= nextZIndex) return;

    const next = { ...current, zIndex: nextZIndex };
    setPositions((prev) => ({ ...prev, [noteId]: next }));
    void saveCanvasPosition(activeBoardId, next.noteId, next.x, next.y, next.width, next.zIndex);
  }

  const filteredNotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return boardNotes;
    return boardNotes.filter((note) => {
      const haystack = `${note.title} ${note.preview} ${note.tags.join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [boardNotes, searchQuery]);

  useEffect(() => {
    if (!activeBoardId) {
      setEdges([]);
      return;
    }

    const visibleIds = new Set(filteredNotes.map((note) => note.id));
    if (visibleIds.size < 2) {
      setEdges([]);
      return;
    }

    let cancelled = false;

    void Promise.allSettled(
      filteredNotes.map(async (note) => ({
        title: note.title,
        noteId: note.id,
        backlinks: await getBacklinks(note.id),
      })),
    ).then((results) => {
      if (cancelled) return;

      const seen = new Set<string>();
      const nextEdges: RelationshipEdge[] = [];

      for (const result of results) {
        if (result.status !== "fulfilled") {
          console.debug("[canvas relationships] backlink fetch failed", result.reason);
          continue;
        }

        const payload = result.value;
        for (const backlink of payload.backlinks) {
          const sourceId = backlink.id;
          if (!visibleIds.has(sourceId) || sourceId === payload.noteId) continue;

          const pair = [payload.noteId, sourceId].sort();
          const edgeId = `${pair[0]}::${pair[1]}`;
          if (seen.has(edgeId)) continue;
          seen.add(edgeId);

          nextEdges.push({
            id: edgeId,
            sourceId,
            targetId: payload.noteId,
          });
        }
      }

      console.debug("[canvas relationships] board", activeBoardId, "visible notes", visibleIds.size, "edges", nextEdges.length);
      setEdges(nextEdges);
    }).catch(() => {
      if (!cancelled) setEdges([]);
    });

    return () => {
      cancelled = true;
    };
  }, [activeBoardId, filteredNotes]);

  function screenToWorld(clientX: number, clientY: number) {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    return {
      x: (clientX - rect.left - camera.x) / camera.scale,
      y: (clientY - rect.top - camera.y) / camera.scale,
    };
  }

  function startPan(clientX: number, clientY: number) {
    dragStateRef.current = {
      kind: "pan",
      startX: clientX,
      startY: clientY,
      originX: camera.x,
      originY: camera.y,
    };
  }

  function handleSurfacePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".canvas-card")) return;
    setSelectedNoteId(null);
    startPan(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCardPointerDown(noteId: string, event: React.PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    setSelectedNoteId(noteId);
    const position = positions[noteId];
    if (!position) return;
    const nextZIndex = getNextZIndex(positions);
    const elevatedPosition = nextZIndex > position.zIndex
      ? { ...position, zIndex: nextZIndex }
      : position;

    if (elevatedPosition !== position) {
      setPositions((prev) => ({ ...prev, [noteId]: elevatedPosition }));
      if (activeBoardId) {
        void saveCanvasPosition(
          activeBoardId,
          elevatedPosition.noteId,
          elevatedPosition.x,
          elevatedPosition.y,
          elevatedPosition.width,
          elevatedPosition.zIndex,
        );
      }
    }

    dragStateRef.current = {
      kind: "card",
      noteId,
      startX: event.clientX,
      startY: event.clientY,
      originX: elevatedPosition.x,
      originY: elevatedPosition.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    if (!drag) return;

    if (drag.kind === "pan") {
      setCamera((prev) => ({
        ...prev,
        x: drag.originX + (event.clientX - drag.startX),
        y: drag.originY + (event.clientY - drag.startY),
      }));
      return;
    }

    const deltaX = (event.clientX - drag.startX) / camera.scale;
    const deltaY = (event.clientY - drag.startY) / camera.scale;
    setPositions((prev) => ({
      ...prev,
      [drag.noteId]: {
        ...prev[drag.noteId],
        x: drag.originX + deltaX,
        y: drag.originY + deltaY,
      },
    }));
  }

  function finishDrag() {
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    if (!drag || drag.kind !== "card" || !activeBoardId) return;

    const position = positions[drag.noteId];
    if (!position) return;
    void saveCanvasPosition(activeBoardId, position.noteId, position.x, position.y, position.width, position.zIndex);
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    event.preventDefault();

    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;

    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const zoomFactor = event.deltaY > 0 ? 0.92 : 1.08;

    setCamera((prev) => {
      const nextScale = Math.max(0.45, Math.min(1.8, prev.scale * zoomFactor));
      const worldX = (pointerX - prev.x) / prev.scale;
      const worldY = (pointerY - prev.y) / prev.scale;

      return {
        scale: nextScale,
        x: pointerX - worldX * nextScale,
        y: pointerY - worldY * nextScale,
      };
    });
  }

  async function handleCreateAtCenter() {
    if (!activeBoardId) return;
    const noteId = await createNoteInStore();
    if (!noteId) return;

    const center = screenToWorld(
      (surfaceRef.current?.getBoundingClientRect().left ?? 0) + (surfaceRef.current?.clientWidth ?? 0) / 2,
      (surfaceRef.current?.getBoundingClientRect().top ?? 0) + (surfaceRef.current?.clientHeight ?? 0) / 2,
    );
    const next = {
      noteId,
      x: center.x - DEFAULT_CARD_WIDTH / 2,
      y: center.y - 80,
      width: DEFAULT_CARD_WIDTH,
      zIndex: getNextZIndex(positions),
    };
    setPositions((prev) => ({ ...prev, [noteId]: next }));
    setSelectedNoteId(noteId);
    await saveCanvasPosition(activeBoardId, next.noteId, next.x, next.y, next.width, next.zIndex);
  }

  async function handleBackgroundDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!activeBoardId) return;
    if ((event.target as HTMLElement).closest(".canvas-card")) return;
    const noteId = await createNoteInStore();
    if (!noteId) return;

    const note = useNoteStore.getState().notes.find((item) => item.id === noteId);
    if (!note) return;

    const worldPoint = screenToWorld(event.clientX, event.clientY);
    const next = {
      noteId: note.id,
      x: worldPoint.x - DEFAULT_CARD_WIDTH / 2,
      y: worldPoint.y - 80,
      width: DEFAULT_CARD_WIDTH,
      zIndex: getNextZIndex(positions),
    };

    setPositions((prev) => ({ ...prev, [note.id]: next }));
    setSelectedNoteId(note.id);
    await saveCanvasPosition(activeBoardId, next.noteId, next.x, next.y, next.width, next.zIndex);
  }

  async function openNote(noteId: string) {
    await openNoteWindow(noteId, "");
  }

  const cards = filteredNotes.map((note) => ({
    note,
    position: positions[note.id],
  })).filter((item) => item.position);

  const cardCenters = useMemo(
    () => Object.fromEntries(
      cards.map(({ note, position }) => [
        note.id,
        {
          x: position.x + position.width / 2,
          y: position.y + 90,
        },
      ]),
    ),
    [cards],
  );

  const renderedEdges = useMemo(
    () => edges.filter((edge) => cardCenters[edge.sourceId] && cardCenters[edge.targetId]),
    [cardCenters, edges],
  );

  return (
    <div className="canvas-view">
      <div className="canvas-toolbar">
        <div className="canvas-toolbar-group">
          <div className="canvas-board-picker">
            <select
              className="canvas-board-select"
              value={activeBoardId ?? ""}
              onChange={(event) => setActiveBoardId(event.target.value)}
            >
              {boards.map((board) => (
                <option key={board.id} value={board.id}>{board.name}</option>
              ))}
            </select>
          </div>
          <button className="canvas-tool-btn" title="Create note at center" onClick={() => void handleCreateAtCenter()}>
            <Plus size={16} />
          </button>
          <div className="canvas-search">
            <Search size={14} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Filter notes…"
            />
          </div>
        </div>

        <div className="canvas-toolbar-group">
          <div className="canvas-zoom-indicator" title="Visible relationships">
            {renderedEdges.length} connection{renderedEdges.length === 1 ? "" : "s"}
          </div>
          <button className="canvas-tool-btn" title="Zoom out" onClick={() => setCamera((prev) => ({ ...prev, scale: Math.max(0.45, prev.scale * 0.9) }))}>
            <ZoomOut size={16} />
          </button>
          <div className="canvas-zoom-indicator">{Math.round(camera.scale * 100)}%</div>
          <button className="canvas-tool-btn" title="Zoom in" onClick={() => setCamera((prev) => ({ ...prev, scale: Math.min(1.8, prev.scale * 1.1) }))}>
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      <div
        ref={surfaceRef}
        className="canvas-surface"
        onPointerDown={handleSurfacePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onWheel={handleWheel}
        onDoubleClick={(event) => void handleBackgroundDoubleClick(event)}
      >
        <div
          className="canvas-grid"
          style={{
            backgroundSize: `${48 * camera.scale}px ${48 * camera.scale}px`,
            backgroundPosition: `${camera.x}px ${camera.y}px`,
          }}
        />

        <div
          className="canvas-stage"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
          }}
        >
          <svg className="canvas-edges" width="100%" height="100%" aria-hidden="true">
            {renderedEdges.map((edge) => {
              const source = cardCenters[edge.sourceId];
              const target = cardCenters[edge.targetId];
              if (!source || !target) return null;

              const isSelected = selectedNoteId !== null
                && (edge.sourceId === selectedNoteId || edge.targetId === selectedNoteId);
              const isDimmed = selectedNoteId !== null && !isSelected;

              return (
                <line
                  key={edge.id}
                  className={`canvas-edge${isSelected ? " selected" : ""}${isDimmed ? " dimmed" : ""}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                />
              );
            })}
          </svg>

          {cards.map(({ note, position }) => (
            <div
              key={note.id}
              className={`canvas-card${selectedNoteId === note.id ? " selected" : ""}`}
              style={{
                transform: `translate(${position.x}px, ${position.y}px)`,
                width: `${position.width}px`,
                zIndex: position.zIndex,
              }}
              onPointerDown={(event) => handleCardPointerDown(note.id, event)}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedNoteId(note.id);
                bringCardToFront(note.id);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                void openNote(note.id);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void openNote(note.id);
                }
              }}
            >
              <div className="canvas-card-header">
                <span className="canvas-card-title">{note.title || "Untitled"}</span>
                <span className="canvas-card-handle"><Grip size={14} /></span>
              </div>

              <div className="canvas-card-preview">{note.preview || "Open this note to start writing."}</div>

              <div className="canvas-card-meta">
                <div className="canvas-card-tags">
                  {note.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="canvas-card-tag">#{tag}</span>
                  ))}
                </div>
                <div className="canvas-card-actions">
                  {/* <span className="canvas-card-action"><MoveDiagonal2 size={14} /></span> */}
                  <button
                    className="canvas-card-open"
                    title="Open in note window"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      void openNote(note.id);
                    }}
                  >
                    <MoveDiagonal2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
