import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const splitSqlStatements = (sqlText) => {
	return sqlText
		.split(/;\s*(?:\r?\n|$)/g)
		.map((statement) => statement.trim())
		.filter(Boolean);
};

const sleep = (durationMs) =>
	new Promise((resolve) => setTimeout(resolve, durationMs));

const runSqlSmoke = async (databaseUrl) => {
	const sqlPath = path.join(__dirname, "sql-smoke.sql");
	const sqlText = await readFile(sqlPath, "utf8");
	const statements = splitSqlStatements(sqlText);

	const client = new Client({
		connectionString: databaseUrl,
		ssl: {
			rejectUnauthorized: false,
		},
	});

	const report = {
		executedStatements: 0,
		lastSelectRows: [],
	};

	await client.connect();
	try {
		for (const statement of statements) {
			const result = await client.query(statement);
			report.executedStatements += 1;
			if (Array.isArray(result.rows) && result.rows.length > 0) {
				report.lastSelectRows = result.rows;
			}
		}
	} finally {
		await client.end();
	}

	return report;
};

const run = async () => {
	const databaseUrl =
		process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error(
			"Neither DATABASE_PUBLIC_URL nor DATABASE_URL is available in environment.",
		);
	}

	let lastError = null;
	const maxAttempts = 4;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const report = await runSqlSmoke(databaseUrl);
			console.log(JSON.stringify(report, null, 2));
			return;
		} catch (error) {
			lastError = error;
			if (attempt === maxAttempts) {
				break;
			}
			await sleep(attempt * 1500);
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error("SQL smoke failed after retries.");
};

run().catch((error) => {
	console.error("SQL smoke runner failed:", error.message);
	process.exit(1);
});
