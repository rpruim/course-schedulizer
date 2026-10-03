/** A small trash can, drawn in the text color, for buttons and labels that delete or remove something. */
export function Trash() {
  return (
    <svg className="trash-icon" viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" d="M2.5 4.5h11M6 4.5V3a.8.8 0 0 1 .8-.8h2.4A.8.8 0 0 1 10 3v1.5M4 4.5l.6 8.2a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.2M6.6 7v4M9.4 7v4" />
    </svg>
  );
}
