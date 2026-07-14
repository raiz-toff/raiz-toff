"use client";

// client-example.tsx — minimal wiring between the site's DcFloor component
// and the living lab. Not a drop-in file: copy the hook + the onNear line
// into wherever DcFloor is rendered, and fix the import path.
//
// The idea: DcFloor fires `onNear(tile)` for every tile the sprite settles
// on while it drains its walk queue. Each call resets the debounce timer,
// so only the LAST tile — the one where the walk actually ends — survives
// and gets POSTed to /api/lab-penguin. Fire-and-forget: we never await the
// response, never block the UI, never surface errors. The lab repo
// re-validates the move anyway (grid bounds, walkability, reachability).

import { useCallback, useEffect, useRef } from "react";
import { DcFloor } from "@/components/dc-floor"; // <- adjust to your project

const DEBOUNCE_MS = 5_000;

/** Debounced, fire-and-forget sync of the penguin's final tile. */
function useLabPenguinSync(debounceMs: number = DEBOUNCE_MS) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending timer on unmount.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(
    (x: number, y: number) => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void fetch("/api/lab-penguin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ x, y }),
          keepalive: true, // lets the request finish if the tab closes
        }).catch(() => {
          /* fire-and-forget: a lost move is fine */
        });
      }, debounceMs);
    },
    [debounceMs],
  );
}

export default function LabLinkedFloor() {
  const syncTile = useLabPenguinSync();

  return (
    <DcFloor
      // onNear fires per queued tile; the debounce above means only the
      // final tile of the walk is ever sent to the lab.
      onNear={(tile: { x: number; y: number }) => syncTile(tile.x, tile.y)}
    />
  );
}
