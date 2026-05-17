import fs from 'fs';
import path from 'path';
import prisma from '../prisma/client';
import {
	buildLegacySchemaAnalysis,
	getLegacyImportFileParseOptions,
	importLegacySqlDump,
	parseLegacySqlDump,
	parseLegacySqlDumpFile,
	renderLegacyImportResult,
	renderLegacySchemaAnalysis,
} from '../modules/legacyMigration/legacySql';

type CliArgs = {
	file?: string;
	schemaFile?: string;
	apply: boolean;
	analyze: boolean;
	json: boolean;
	inventoryState?: string;
	fractionalQuantityMode?: 'preserve' | 'skip' | 'round';
	defaultFloorCode?: string;
	defaultFloorName?: string;
};

function printUsage() {
	console.log([
		'Usage:',
		'  npm exec --workspace=packages/backend ts-node src/scripts/importLegacySqlDump.ts -- --file <path> [--analyze] [--apply]',
		'',
		'Options:',
		'  --file <path>                 Path to the legacy MySQL dump.',
		'  --schema-file <path>          Optional schema-only dump to seed table definitions and skip the schema-discovery pass.',
		'  --analyze                     Print a schema and migration-gap analysis.',
		'  --apply                       Import supported data into the current database.',
		'  --json                        Print JSON instead of human-readable text.',
		'  --inventory-state <value>     Inventory state to use for imported stock. Default: ShelfReady',
		'  --fractional-qty <preserve|skip|round> How to handle decimal quantities. Default: preserve',
		'  --default-floor-code <value>  Floor code for auto-created branch floors. Default: MAIN',
		'  --default-floor-name <value>  Floor name for auto-created branch floors. Default: Main Floor',
	].join('\n'));
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = {
		apply: false,
		analyze: false,
		json: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		switch (arg) {
			case '--file':
				args.file = argv[index + 1];
				index += 1;
				break;
			case '--schema-file':
				args.schemaFile = argv[index + 1];
				index += 1;
				break;
			case '--apply':
				args.apply = true;
				break;
			case '--analyze':
				args.analyze = true;
				break;
			case '--json':
				args.json = true;
				break;
			case '--inventory-state':
				args.inventoryState = argv[index + 1];
				index += 1;
				break;
			case '--fractional-qty': {
				const mode = argv[index + 1];
				if (mode === 'preserve' || mode === 'skip' || mode === 'round') {
					args.fractionalQuantityMode = mode;
				}
				index += 1;
				break;
			}
			case '--default-floor-code':
				args.defaultFloorCode = argv[index + 1];
				index += 1;
				break;
			case '--default-floor-name':
				args.defaultFloorName = argv[index + 1];
				index += 1;
				break;
			case '--help':
			case '-h':
				printUsage();
				process.exit(0);
				break;
			default:
				break;
		}
	}

	if (!args.analyze && !args.apply) {
		args.analyze = true;
	}

	return args;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!args.file) {
		printUsage();
		throw new Error('Missing required --file argument.');
	}

	const filePath = path.resolve(process.cwd(), args.file);
	if (!fs.existsSync(filePath)) {
		throw new Error(`File not found: ${filePath}`);
	}

	let schemaTables;
	if (args.schemaFile) {
		const schemaPath = path.resolve(process.cwd(), args.schemaFile);
		if (!fs.existsSync(schemaPath)) {
			throw new Error(`Schema file not found: ${schemaPath}`);
		}
		const schemaDump = parseLegacySqlDump(fs.readFileSync(schemaPath, 'utf8'));
		schemaTables = schemaDump.tables;
	}

	const dump = await parseLegacySqlDumpFile(filePath, {
		...getLegacyImportFileParseOptions(),
		knownTables: schemaTables,
	});
	const analysis = buildLegacySchemaAnalysis(dump);

	if (args.analyze) {
		if (args.json) {
			console.log(JSON.stringify({ filePath, analysis }, null, 2));
		} else {
			console.log(renderLegacySchemaAnalysis(analysis, `Legacy SQL analysis for ${path.basename(filePath)}`));
		}
	}

	if (!args.apply) {
		return;
	}

	if (!analysis.hasData) {
		throw new Error('The supplied SQL file has no `INSERT INTO` statements. Use a full data dump or exported table data before running with --apply.');
	}

	const result = await importLegacySqlDump(prisma, dump, {
		defaultFloorCode: args.defaultFloorCode,
		defaultFloorName: args.defaultFloorName,
		inventoryState: args.inventoryState,
		fractionalQuantityMode: args.fractionalQuantityMode,
	});

	if (args.json) {
		console.log(JSON.stringify({ filePath, result }, null, 2));
		return;
	}

	console.log('');
	console.log(renderLegacyImportResult(result, `Legacy SQL import for ${path.basename(filePath)}`));
}

main()
	.catch((error: any) => {
		console.error(error?.message ?? error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
