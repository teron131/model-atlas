/** Public methodology route backed directly by the repository methodology document. */

import type { Metadata } from "next";

import { DocumentPage } from "./DocumentPage";

export const metadata: Metadata = {
  title: "Methodology | Model Atlas",
  description:
    "How Model Atlas converts benchmark, price, and runtime evidence into separate Intelligence, Agentic, Speed, and Value Scores.",
};

export default function MethodologyPage() {
  return <DocumentPage document="methodology" />;
}
