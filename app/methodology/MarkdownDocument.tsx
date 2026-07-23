/** Trusted repository Markdown renderer with stable headings, links, math, and figures. */

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import {
	documentImageSize,
	documentImageSource,
	documentLink,
	headingId,
} from "./documents";
import styles from "./methodology.module.css";

export function MarkdownDocument({ markdown }: { markdown: string }) {
	return (
		<ReactMarkdown
			components={markdownComponents}
			rehypePlugins={[rehypeKatex]}
			remarkPlugins={[remarkGfm, remarkMath]}
		>
			{markdown}
		</ReactMarkdown>
	);
}

const MarkdownImage: NonNullable<Components["img"]> = ({
	src = "",
	alt = "",
}) => {
	if (typeof src !== "string") {
		return null;
	}
	const size = documentImageSize(src);
	return (
		<span className={styles.figure}>
			<Image
				src={documentImageSource(src)}
				alt={alt}
				width={size.width}
				height={size.height}
			/>
			{alt === "" ? null : <span aria-hidden="true">{alt}</span>}
		</span>
	);
};

const markdownComponents: Components = {
	h2: ({ children }) => (
		<h2 id={headingId(textContent(children))}>{children}</h2>
	),
	h3: ({ children }) => (
		<h3 id={headingId(textContent(children))}>{children}</h3>
	),
	h4: ({ children }) => (
		<h4 id={headingId(textContent(children))}>{children}</h4>
	),
	a: ({ href = "", children, ...props }) => {
		const resolvedHref = documentLink(href);
		return resolvedHref.startsWith("/") ? (
			<Link href={resolvedHref} prefetch={false} {...props}>
				{children}
			</Link>
		) : (
			<a href={resolvedHref} {...props}>
				{children}
			</a>
		);
	},
	img: MarkdownImage,
};

function textContent(children: ReactNode): string {
	if (typeof children === "string" || typeof children === "number") {
		return String(children);
	}
	if (Array.isArray(children)) {
		return children.map(textContent).join("");
	}
	if (
		children != null &&
		typeof children === "object" &&
		"props" in children &&
		children.props != null &&
		typeof children.props === "object" &&
		"children" in children.props
	) {
		return textContent(children.props.children as ReactNode);
	}
	return "";
}
