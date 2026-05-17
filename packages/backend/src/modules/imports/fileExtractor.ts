import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { PreparedPromptContent } from './types';

const MAX_INLINE_TEXT_LENGTH = 120_000;

const MIME_BY_EXTENSION: Record<string, string> = {
	'.csv': 'text/csv',
	'.gif': 'image/gif',
	'.jpeg': 'image/jpeg',
	'.jpg': 'image/jpeg',
	'.json': 'application/json',
	'.pdf': 'application/pdf',
	'.png': 'image/png',
	'.txt': 'text/plain',
	'.webp': 'image/webp',
	'.xls': 'application/vnd.ms-excel',
	'.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function getMimeType(filename: string, explicitMimeType?: string | null) {
	if (explicitMimeType && explicitMimeType !== 'application/octet-stream') {
		return explicitMimeType;
	}

	return MIME_BY_EXTENSION[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
}

function trimInlineText(text: string) {
	if (text.length <= MAX_INLINE_TEXT_LENGTH) {
		return { text, truncated: false };
	}

	return {
		text: `${text.slice(0, MAX_INLINE_TEXT_LENGTH)}\n\n[Truncated because the extracted text exceeded the inline safety limit for one Claude request.]`,
		truncated: true,
	};
}

function workbookToText(filePath: string) {
	const workbook = XLSX.readFile(filePath, { cellDates: false });
	const sections = workbook.SheetNames.map((sheetName) => {
		const sheet = workbook.Sheets[sheetName];
		const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
		return `## Sheet: ${sheetName}\n${csv}`;
	}).filter((section) => section.trim().length > 0);

	return {
		text: sections.join('\n\n'),
		sheetNames: workbook.SheetNames,
	};
}

export function getSupportedImportMimeType(filename: string, explicitMimeType?: string | null) {
	return getMimeType(filename, explicitMimeType);
}

export function isSupportedImportFile(filename: string, explicitMimeType?: string | null) {
	const mimeType = getMimeType(filename, explicitMimeType);
	return [
		'application/json',
		'application/pdf',
		'image/gif',
		'image/jpeg',
		'image/png',
		'image/webp',
		'text/csv',
		'text/plain',
		'application/vnd.ms-excel',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	].includes(mimeType);
}

export async function preparePromptContent(filePath: string, filename: string, explicitMimeType?: string | null): Promise<PreparedPromptContent> {
	const mimeType = getMimeType(filename, explicitMimeType);
	const warnings: string[] = [];
	const metadata: Record<string, any> = {
		filename,
		mimeType,
	};

	if (mimeType === 'application/pdf') {
		const buffer = fs.readFileSync(filePath);
		metadata.sizeBytes = buffer.byteLength;

		return {
			contentBlocks: [
				{
					type: 'document',
					title: filename,
					source: {
						type: 'base64',
						media_type: 'application/pdf',
						data: buffer.toString('base64'),
					},
				},
			],
			metadata,
			warnings,
		};
	}

	if (mimeType.startsWith('image/')) {
		const buffer = fs.readFileSync(filePath);
		metadata.sizeBytes = buffer.byteLength;

		return {
			contentBlocks: [
				{
					type: 'image',
					source: {
						type: 'base64',
						media_type: mimeType,
						data: buffer.toString('base64'),
					},
				},
			],
			metadata,
			warnings,
		};
	}

	let text = '';

	if (mimeType === 'text/plain' || mimeType === 'text/csv' || mimeType === 'application/json') {
		text = fs.readFileSync(filePath, 'utf8');
	} else if (
		mimeType === 'application/vnd.ms-excel'
		|| mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	) {
		const workbook = workbookToText(filePath);
		text = workbook.text;
		metadata.sheetNames = workbook.sheetNames;
	} else {
		throw new Error(`Unsupported import file type "${mimeType}"`);
	}

	const { text: inlineText, truncated } = trimInlineText(text.trim());
	if (truncated) {
		warnings.push('The extracted text was truncated before sending it to Claude. Split very large spreadsheets or documents for the best results.');
	}

	metadata.previewLength = inlineText.length;
	metadata.truncated = truncated;

	return {
		contentBlocks: [
			{
				type: 'text',
				text: `Filename: ${filename}\nMime type: ${mimeType}\n\n${inlineText}`,
			},
		],
		metadata,
		warnings,
	};
}
