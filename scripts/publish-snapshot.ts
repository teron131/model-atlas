/** Operate snapshot publication and recovery explicitly, without running source refreshes for history, migration, or rollback. */

import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import {
  migrateSnapshotRetention,
  publishSnapshot,
  readSnapshotHistory,
  rollbackSnapshot,
} from "../src/model-atlas/database/snapshots/publish";

if (existsSync(".env")) loadEnvFile(".env");
const args = process.argv.slice(2);
let result: unknown;
if (args.length === 0) {
  result = await publishSnapshot();
} else if (args.length === 2 && args[0] === "--seed" && args[1]) {
  result = await publishSnapshot(args[1]);
} else if (args.length === 2 && args[0] === "--rollback" && args[1]) {
  result = await rollbackSnapshot(args[1]);
} else if (args.length === 1 && args[0] === "--history") {
  result = await readSnapshotHistory();
} else if (args.length === 1 && args[0] === "--migrate-retention") {
  result = await migrateSnapshotRetention();
} else {
  throw new Error(
    "Usage: pnpm snapshot:publish [--seed <database.sqlite> | --history | --rollback <version> | --migrate-retention]",
  );
}
console.log(JSON.stringify(result, null, 2));
