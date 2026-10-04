/** A small trash can, drawn in the text color, for buttons and labels that delete or remove something. */
export function Trash() {
  return (
    <svg className="trash-icon" viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" d="M2.5 4.5h11M6 4.5V3a.8.8 0 0 1 .8-.8h2.4A.8.8 0 0 1 10 3v1.5M4 4.5l.6 8.2a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.2M6.6 7v4M9.4 7v4" />
    </svg>
  );
}

const svg = { viewBox: "0 0 16 16", width: "1em", height: "1em", "aria-hidden": true, focusable: false } as const;

/** A warning triangle: a conflict. */
export function Warn() {
  return (
    <svg {...svg} className="flag-icon flag-conflict">
      <path d="M8 1.6 15 14H1z" fill="#D55E00" stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
      <path d="M8 6v4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="12" r="1" fill="#fff" />
    </svg>
  );
}

/** A clock: a meeting at a time that is not a standard time. */
export function Clock() {
  return (
    <svg {...svg} className="flag-icon flag-nonstd">
      <circle cx="8" cy="8" r="6.4" fill="#fff" stroke="#B87900" strokeWidth="1.6" />
      <path d="M8 4.2V8l2.6 1.6" fill="none" stroke="#B87900" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A check mark in a circle: a selected section. */
export function Check() {
  return (
    <svg {...svg} className="flag-icon flag-selected">
      <circle cx="8" cy="8" r="7" fill="#009E73" stroke="#fff" strokeWidth="1" />
      <path d="M4.6 8.4 7 10.8l4.6-5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The three roles a Compare column can have: ignore (a circle with a slash), group (a grid of cells), aggregate (a sigma). */
export function RoleIcon({ role }: { role: "ignore" | "group" | "aggregate" }) {
  return (
    <svg {...svg} className={`role-icon role-icon-${role}`}>
      {role === "ignore" && (
        <>
          <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M4.2 11.8 11.8 4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {role === "group" && (
        <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <rect x="2.4" y="2.4" width="4.6" height="4.6" rx=".8" />
          <rect x="9" y="2.4" width="4.6" height="4.6" rx=".8" />
          <rect x="2.4" y="9" width="4.6" height="4.6" rx=".8" />
          <rect x="9" y="9" width="4.6" height="4.6" rx=".8" />
        </g>
      )}
      {role === "aggregate" && <path d="M12 3H4.4L9 8l-4.6 5H12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/** Arrows in the four directions: a handle to drag something by. */
export function Move() {
  return (
    <svg {...svg} className="move-icon">
      <path fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" d="M8 1.5v13M1.5 8h13M8 1.5 6.2 3.3M8 1.5l1.8 1.8M8 14.5l-1.8-1.8M8 14.5l1.8-1.8M1.5 8l1.8-1.8M1.5 8l1.8 1.8M14.5 8l-1.8-1.8M14.5 8l-1.8 1.8" />
    </svg>
  );
}
