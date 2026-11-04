import { afterEach } from "vitest";
import { drainScheduled } from "./harness";

// Mutations under test schedule notification fan-out with `runAfter(0)`.
// Draining it between tests keeps a scheduled write from landing after its
// transaction has closed, which would otherwise show up as an unhandled
// rejection attributed to whichever test happened to be running.
afterEach(async () => {
  await drainScheduled();
});
