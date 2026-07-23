/** Static related-document routes within the Model Atlas methodology section. */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocumentPage } from "../DocumentPage";
import { DOCUMENTS, isDocumentSlug } from "../documents";

export function generateStaticParams() {
	return DOCUMENTS.filter((document) => document.slug !== "methodology").map(
		(document) => ({ document: document.slug }),
	);
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ document: string }>;
}): Promise<Metadata> {
	const { document } = await params;
	const match = DOCUMENTS.find((item) => item.slug === document);
	return match == null
		? {}
		: {
				title: `${match.title} | Model Atlas`,
				description: match.description,
			};
}

export default async function RelatedDocumentPage({
	params,
}: {
	params: Promise<{ document: string }>;
}) {
	const { document } = await params;
	if (!isDocumentSlug(document) || document === "methodology") {
		notFound();
	}
	return <DocumentPage document={document} />;
}
