/**
 * <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16}}>
 *  <p>Official <a href="https://orm.drizzle.team">Drizzle ORM</a> adapter for Auth.js / NextAuth.js.</p>
 *  <a href="https://orm.drizzle.team">
 *   <img style={{display: "block"}} src="/img/adapters/drizzle.svg" width="38" />
 *  </a>
 * </div>
 *
 * ## Installation
 *
 * ```bash npm2yarn
 * npm install drizzle-orm @auth/drizzle-adapter
 * npm install drizzle-kit --save-dev
 * ```
 *
 * @module @auth/drizzle-adapter
 */
import { is } from "drizzle-orm";
import { MySqlDatabase } from "drizzle-orm/mysql-core";
import { PgDatabase } from "drizzle-orm/pg-core";
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { MySqlDrizzleAdapter } from "./lib/mysql.js";
import { PostgresDrizzleAdapter } from "./lib/pg.js";
import { SQLiteDrizzleAdapter } from "./lib/sqlite.js";
export function DrizzleAdapter(db, schema) {
    if (is(db, MySqlDatabase)) {
        return MySqlDrizzleAdapter(db, schema);
    }
    else if (is(db, PgDatabase)) {
        return PostgresDrizzleAdapter(db, schema);
    }
    else if (is(db, BaseSQLiteDatabase)) {
        return SQLiteDrizzleAdapter(db, schema);
    }
    throw new Error(`Unsupported database type (${typeof db}) in Auth.js Drizzle adapter.`);
}
