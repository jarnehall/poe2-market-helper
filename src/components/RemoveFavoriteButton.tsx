function RemoveFavoriteButton({
  onRemove,
  itemName,
}: {
  onRemove: () => void;
  itemName: string;
}) {
  return (
    <button
      type="button"
      className="remove-favorite-button"
      aria-label={`Remove ${itemName} from Favorites`}
      // Cards aren't otherwise clickable, but this stops the click from
      // reaching anything a card might sit inside of — same reasoning as
      // FavoriteStar's stopPropagation.
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="6" y1="6" x2="18" y2="18" />
        <line x1="18" y1="6" x2="6" y2="18" />
      </svg>
    </button>
  );
}

export default RemoveFavoriteButton;
