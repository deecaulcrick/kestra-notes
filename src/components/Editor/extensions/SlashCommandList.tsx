import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { SlashCommandItem } from "./SlashCommands";

interface Props {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export interface SlashCommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashCommandList = forwardRef<SlashCommandListRef, Props>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Reset selection when the filtered list changes.
    useEffect(() => setSelectedIndex(0), [items]);

    // Scroll the selected item into view.
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const selected = container.querySelector<HTMLButtonElement>(
        ".slash-menu-item--selected"
      );
      selected?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;

        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          command(items[selectedIndex]);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="slash-menu">
          <p className="slash-menu-empty">No results</p>
        </div>
      );
    }

    return (
      <div className="slash-menu" ref={containerRef}>
        {items.map((item, i) => (
          <button
            key={item.title}
            className={`slash-menu-item${
              i === selectedIndex ? " slash-menu-item--selected" : ""
            }`}
            onMouseEnter={() => setSelectedIndex(i)}
            onMouseDown={(e) => {
              // Prevent the editor from losing focus.
              e.preventDefault();
              command(item);
            }}
          >
            <span className="slash-menu-item-icon">{item.icon}</span>
            <span className="slash-menu-item-body">
              <span className="slash-menu-item-title">{item.title}</span>
              <span className="slash-menu-item-desc">{item.description}</span>
            </span>
          </button>
        ))}
      </div>
    );
  }
);

SlashCommandList.displayName = "SlashCommandList";
