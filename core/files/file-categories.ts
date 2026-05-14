/**
 * File category helpers — central source of truth for what MIME types each
 * file category covers. Used by the admin "Allowed file types" setting and
 * by the FileDropzone's `accept` attribute.
 *
 * One category covers many MIME types so admins toggle a small number of
 * checkboxes (e.g. "PDFs only" or "Images + PDFs") instead of pasting raw
 * MIME strings.
 */

export type FileCategory =
	| "image"
	| "pdf"
	| "document"
	| "spreadsheet"
	| "video"
	| "audio"
	| "archive"
	| "other";

interface CategoryDef {
	id: FileCategory;
	label: string;
	description: string;
	/** Browser-friendly accept tokens (extension or mime/range). */
	accept: string[];
	/** Predicate to test if a given MIME type belongs to this category. */
	matches: (mime: string) => boolean;
}

export const FILE_CATEGORIES: CategoryDef[] = [
	{
		id: "image",
		label: "Images",
		description: "PNG, JPG, GIF, WebP, SVG, …",
		accept: ["image/*"],
		matches: (mime) => mime.startsWith("image/"),
	},
	{
		id: "pdf",
		label: "PDFs",
		description: "Adobe Acrobat documents",
		accept: ["application/pdf", ".pdf"],
		matches: (mime) => mime === "application/pdf",
	},
	{
		id: "document",
		label: "Documents",
		description: "Word, OpenDocument, plain text, RTF, …",
		accept: [
			"application/msword",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			"application/vnd.oasis.opendocument.text",
			"application/rtf",
			"text/plain",
			".doc",
			".docx",
			".odt",
			".rtf",
			".txt",
		],
		matches: (mime) =>
			mime === "application/msword" ||
			mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
			mime === "application/vnd.oasis.opendocument.text" ||
			mime === "application/rtf" ||
			mime === "text/plain",
	},
	{
		id: "spreadsheet",
		label: "Spreadsheets",
		description: "Excel, Numbers, OpenDocument, CSV, …",
		accept: [
			"application/vnd.ms-excel",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"application/vnd.oasis.opendocument.spreadsheet",
			"text/csv",
			".xls",
			".xlsx",
			".ods",
			".csv",
		],
		matches: (mime) =>
			mime === "application/vnd.ms-excel" ||
			mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
			mime === "application/vnd.oasis.opendocument.spreadsheet" ||
			mime === "text/csv",
	},
	{
		id: "video",
		label: "Video",
		description: "MP4, WebM, MOV, …",
		accept: ["video/*"],
		matches: (mime) => mime.startsWith("video/"),
	},
	{
		id: "audio",
		label: "Audio",
		description: "MP3, WAV, OGG, …",
		accept: ["audio/*"],
		matches: (mime) => mime.startsWith("audio/"),
	},
	{
		id: "archive",
		label: "Archives",
		description: "ZIP, RAR, 7z, TAR, …",
		accept: [
			"application/zip",
			"application/x-rar-compressed",
			"application/x-7z-compressed",
			"application/x-tar",
			"application/gzip",
			".zip",
			".rar",
			".7z",
			".tar",
			".gz",
		],
		matches: (mime) =>
			mime === "application/zip" ||
			mime === "application/x-rar-compressed" ||
			mime === "application/x-7z-compressed" ||
			mime === "application/x-tar" ||
			mime === "application/gzip",
	},
	{
		id: "other",
		label: "Other",
		description: "Anything else",
		accept: [],
		matches: () => true, // fallback — used when category whitelist is empty
	},
];

/** Build a comma-separated `accept` string from selected categories. */
export function buildAcceptString(categories: FileCategory[] | undefined): string | undefined {
	if (!categories || categories.length === 0) return undefined; // allow all
	if (categories.includes("other")) return undefined; // "other" is the wildcard escape
	const tokens: string[] = [];
	for (const c of categories) {
		const def = FILE_CATEGORIES.find((d) => d.id === c);
		if (def) tokens.push(...def.accept);
	}
	return tokens.join(",");
}

/** Validate an uploaded File against the configured category whitelist. */
export function isFileAllowed(file: File, categories: FileCategory[] | undefined): boolean {
	if (!categories || categories.length === 0) return true; // allow all
	if (categories.includes("other")) return true; // "other" wildcard
	return categories.some((c) =>
		FILE_CATEGORIES.find((d) => d.id === c)?.matches(file.type ?? ""),
	);
}

/** Resolve which category a given mime type belongs to (for stats / labels). */
export function categoryFor(mime: string): FileCategory {
	for (const def of FILE_CATEGORIES) {
		if (def.id === "other") continue;
		if (def.matches(mime)) return def.id;
	}
	return "other";
}
