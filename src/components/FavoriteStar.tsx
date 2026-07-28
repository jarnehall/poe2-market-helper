function FavoriteStar({
  isFavorite,
  onToggle,
  itemName,
}: {
  isFavorite: boolean;
  onToggle: () => void;
  itemName: string;
}) {
  return (
    <button
      type="button"
      className={isFavorite ? "favorite-star favorite-star-active" : "favorite-star"}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? `Unpin ${itemName} from Favorites` : `Pin ${itemName} to Favorites`}
      // Cards aren't otherwise clickable, but this stops the click from
      // reaching anything a card might sit inside of (e.g. a future link
      // wrapper) — cheap insurance for a control that lives in a corner
      // easy to fat-finger past.
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={isFavorite ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polygon points="12 2.5 15.09 8.76 22 9.77 17 14.64 18.18 21.52 12 18.27 5.82 21.52 7 14.64 2 9.77 8.91 8.76 12 2.5" />
      </svg>
    </button>
  );
}

export default FavoriteStar;
