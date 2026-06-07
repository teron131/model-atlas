import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import sharp from "sharp";

const DEFAULT_SOURCE_PATH = "public/icons/icon.png";
const DEFAULT_OUTPUT_PATH = "public/favicon.ico";
const ICON_SIZES = [16, 32, 64] as const;

export async function generateFavicon(
	sourcePath = DEFAULT_SOURCE_PATH,
	outputPath = DEFAULT_OUTPUT_PATH,
) {
	const images = await Promise.all(
		ICON_SIZES.map(async (size) => ({
			size,
			buffer: await sharp(sourcePath)
				.resize(size, size, { fit: "contain" })
				.png()
				.toBuffer(),
		})),
	);

	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);

	const entryLength = 16;
	let imageOffset = header.length + images.length * entryLength;
	const entries = images.map(({ size, buffer }) => {
		const entry = Buffer.alloc(entryLength);
		entry.writeUInt8(size, 0);
		entry.writeUInt8(size, 1);
		entry.writeUInt8(0, 2);
		entry.writeUInt8(0, 3);
		entry.writeUInt16LE(1, 4);
		entry.writeUInt16LE(32, 6);
		entry.writeUInt32LE(buffer.length, 8);
		entry.writeUInt32LE(imageOffset, 12);
		imageOffset += buffer.length;
		return entry;
	});

	const resolvedOutputPath = resolve(outputPath);
	await mkdir(dirname(resolvedOutputPath), { recursive: true });
	await writeFile(
		resolvedOutputPath,
		Buffer.concat([header, ...entries, ...images.map((image) => image.buffer)]),
	);

	return {
		source: resolve(sourcePath),
		path: resolvedOutputPath,
		sizes: [...ICON_SIZES],
	};
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const result = await generateFavicon(process.argv[2], process.argv[3]);
	console.log(JSON.stringify(result, null, 2));
}
