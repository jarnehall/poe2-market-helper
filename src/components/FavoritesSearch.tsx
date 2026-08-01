import { useEffect, useRef, useState } from "react";
import { useFavorites } from "../context/FavoritesContext";
import { useGame } from "../context/GameContext";
import { fetchItemsCatalog } from "../lib/api";
import { getImageUrl } from "../lib/marketData";
import type { CatalogItem, FavoriteItem } from "../types";
import FavoriteStar from "./FavoriteStar";

const MAX_RESULTS = 8;

function resultId(item: CatalogItem): string {
  return `favorites-search-result-${item.id}`;
}

function toFavorite(item: CatalogItem): FavoriteItem {
  return { category: item.category, itemId: item.id, pairId: item.pairId };
}

function FavoritesSearch() {
  const { isFavorite, toggleFavorite } = useFavorites();
  const { game } = useGame();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  // -1 means nothing highlighted; otherwise an index into `results` below,
  // kept in sync by both arrow-key navigation and mouse hover so the two
  // input methods never disagree about which row is "active".
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetched once, lazily — the catalog is only needed once the user starts
  // typing, and it's the same regardless of any league/filter selection.
  useEffect(() => {
    const controller = new AbortController();
    fetchItemsCatalog(game, controller.signal)
      .then((response) => setCatalog(response.items))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [game]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  const trimmed = query.trim().toLowerCase();
  const results =
    trimmed === ""
      ? []
      : catalog
          .filter((item) => item.name.toLowerCase().includes(trimmed))
          .slice(0, MAX_RESULTS);

  return (
    <div className="favorites-search" ref={containerRef}>
      <input
        type="text"
        className="favorites-search-input"
        placeholder="Search items to pin to Favorites…"
        value={query}
        role="combobox"
        aria-expanded={isOpen && trimmed !== ""}
        aria-controls="favorites-search-listbox"
        aria-activedescendant={
          highlightedIndex >= 0 && results[highlightedIndex] ? resultId(results[highlightedIndex]) : undefined
        }
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlightedIndex(0);
        }}
        onFocus={() => {
          setIsOpen(true);
          setHighlightedIndex(0);
        }}
        onBlur={() => {
          // Deferred a tick — blur fires before a click on a result row/star
          // finishes registering (mousedown moves focus off the input
          // first), so clearing synchronously here would wipe the results
          // out from under that click before its own handler ran.
          window.setTimeout(() => {
            setQuery("");
            setIsOpen(false);
          }, 0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setQuery("");
            setIsOpen(false);
            return;
          }
          if (results.length === 0) return;

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex((index) => Math.min(index + 1, results.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            const item = results[highlightedIndex];
            if (item) toggleFavorite(toFavorite(item));
          }
        }}
      />
      {isOpen && trimmed !== "" && (
        <ul className="favorites-search-results" id="favorites-search-listbox" role="listbox">
          {results.length === 0 ? (
            <li className="favorites-search-empty">No items match &ldquo;{query.trim()}&rdquo;.</li>
          ) : (
            results.map((item, index) => (
              <li
                key={item.id}
                id={resultId(item)}
                role="option"
                aria-selected={index === highlightedIndex}
                className={
                  index === highlightedIndex
                    ? "favorites-search-result favorites-search-result-active"
                    : "favorites-search-result"
                }
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => toggleFavorite(toFavorite(item))}
              >
                <img
                  className="favorites-search-result-image"
                  src={getImageUrl(item.image)}
                  alt={item.name}
                />
                <span className="favorites-search-result-name">{item.name}</span>
                <span className="category-badge">{item.category}</span>
                <FavoriteStar
                  isFavorite={isFavorite(item.id, item.pairId)}
                  onToggle={() => toggleFavorite(toFavorite(item))}
                  itemName={item.name}
                />
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export default FavoritesSearch;
