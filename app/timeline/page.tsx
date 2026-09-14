/** Historical capability is an experimental view with its own evidence scope and configurable ruler. */

import { TimelineExplorer } from "./TimelineExplorer";

export const metadata = { title: "Timeline | Model Atlas" };

export default function TimelinePage() {
  return <TimelineExplorer />;
}
