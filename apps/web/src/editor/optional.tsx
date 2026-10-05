/** A small raised circle after the name of a field that is optional: the registrar's office does not use it to build the schedule. */
export function Optional() {
  return <sup className="opt" title="Optional: the registrar’s office does not use this; it is for schedule builders">°</sup>;
}

/** The line that says what the circle means, for the foot of an editor. */
export function OptionalNote() {
  return (
    <p className="muted small opt-note">
      <Optional /> Optional: the registrar’s office does not use these fields; they are for schedule builders.
    </p>
  );
}
