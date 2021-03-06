/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/naming-convention */

import { isEmptyArray, isPackageInstalled } from "@techmmunity/utils";
import { loadEntities, Logger } from "@thothom/core";
import { readdirSync } from "fs";

import type { BaseQueryRunner } from "../../lib/query-runner";

import { getConfigFile } from "../utils/get-config-file";
import { getMigrationsPath } from "../utils/get-migrations-path";

import type { Plugin } from "./types/plugin";

interface MigrationFile {
	Migration: {
		new (): {
			up: (queryRunner: BaseQueryRunner) => Promise<void>;
			down: (queryRunner: BaseQueryRunner) => Promise<void>;
		};
	};
}

export const runMigrations = async () => {
	const migrationsPath = await getMigrationsPath();

	const { connectionConfig, plugin, entitiesDir } = await getConfigFile();

	if (!isPackageInstalled(plugin)) {
		Logger.cliError(`Plugin not found: ${plugin}`);

		process.exit(1);
	}

	const { Connection, QueryRunner, SyncManager } = (await import(
		plugin
	)) as Plugin;

	const entities = await loadEntities(entitiesDir);

	const connection = new Connection({
		...connectionConfig,
		entities,
	});

	await connection.connect();

	const migrations = readdirSync(migrationsPath);

	const syncManager = new SyncManager(connection);
	const executedMigrations = await syncManager.getExecutedMigrations();

	const notExecutedMigrations = migrations.filter(
		migration => !executedMigrations.includes(migration),
	);

	if (isEmptyArray(notExecutedMigrations)) {
		Logger.cliLog("Everything is already synced.");

		process.exit(0);
	}

	const queryRunner = new QueryRunner(connection);

	for (const migrationFileName of notExecutedMigrations) {
		const { Migration } = (await import(
			`${migrationsPath}/${migrationFileName}`
		)) as MigrationFile;

		const migration = new Migration();

		try {
			await migration.up(queryRunner);
		} catch (err: any) {
			await migration.down(queryRunner).catch();
		}
	}
};
