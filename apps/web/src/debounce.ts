import { useEffect, useState } from "react";

/**
 * The value as it was once it stopped changing for `ms` milliseconds: for work that is too slow to redo on every keystroke (the
 * editors' live checks). The first value is used at once.
 */
export function useSettled<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(value, settled)) return;
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]); // eslint-disable-line react-hooks/exhaustive-deps
  return settled;
}
