function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="chevron-icon"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export default ChevronIcon
