/* ---------- Store columns on To get and At home ----------
   On a wide screen the stores sit side by side, one column each (CSS grid; the widths decide 1, 2 or 3 across). A list with fewer stores than
   columns must not leave an empty column, so the grid is capped at the number of stores: this returns the class that carries the cap. Pure. */

export const MAX_COLUMNS = 3;

/** `gcols1` to `gcols3`: the most columns the grid may use for this many store sections (0 or 1 sections stay one column). */
export function columnsClass(sections: number): `gcols${1 | 2 | 3}` {
  const n = Math.min(MAX_COLUMNS, Math.max(1, Math.floor(sections) || 1));
  return `gcols${n}` as `gcols${1 | 2 | 3}`;
}
