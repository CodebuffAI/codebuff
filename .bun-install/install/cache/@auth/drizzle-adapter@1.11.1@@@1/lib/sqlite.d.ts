import { GeneratedColumnConfig } from "drizzle-orm";
import { BaseSQLiteDatabase, SQLiteColumn, SQLiteTableWithColumns } from "drizzle-orm/sqlite-core";
import type { Adapter } from "@auth/core/adapters";
export declare function defineTables(schema?: Partial<DefaultSQLiteSchema>): Required<DefaultSQLiteSchema>;
export declare function SQLiteDrizzleAdapter(client: BaseSQLiteDatabase<"sync" | "async", any, any>, schema?: DefaultSQLiteSchema): Adapter;
type DefaultSQLiteColumn<T extends {
    data: string | boolean | number | Date;
    dataType: "string" | "boolean" | "number" | "date";
    notNull: boolean;
    isPrimaryKey?: boolean;
    columnType: "SQLiteText" | "SQLiteBoolean" | "SQLiteTimestamp" | "SQLiteInteger";
}> = SQLiteColumn<{
    name: string;
    isAutoincrement: boolean;
    isPrimaryKey: T["isPrimaryKey"] extends true ? true : false;
    hasRuntimeDefault: boolean;
    generated: GeneratedColumnConfig<T["data"]> | undefined;
    columnType: T["columnType"];
    data: T["data"];
    driverParam: string | number | boolean;
    notNull: T["notNull"];
    hasDefault: boolean;
    enumValues: any;
    dataType: T["dataType"];
    tableName: string;
}>;
export type DefaultSQLiteUsersTable = SQLiteTableWithColumns<{
    name: string;
    columns: {
        id: DefaultSQLiteColumn<{
            columnType: "SQLiteText";
            data: string;
            isPrimaryKey: true;
            notNull: true;
            dataType: "string";
        }>;
        name: DefaultSQLiteColumn<{
            columnType: "SQLiteText";
            data: string;
            notNull: boolean;
            dataType: "string";
        }>;
        email: DefaultSQLiteColumn<{
            columnType: "SQLiteText";
            data: string;
            notNull: boolean;
            dataType: "string";
        }>;
        emailVerified: DefaultSQLiteColumn<{
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            notNull: boolean;
        }>;
        image: DefaultSQLiteColumn<{
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            notNull: boolean;
        }>;
    };
    dialect: "sqlite";
    schema: string | undefined;
}>;
export type DefaultSQLiteAccountsTable = SQLiteTableWithColumns<{
    name: string;
    columns: {
        userId: DefaultSQLiteColumn<{
            columnType: "SQLiteText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        type: DefaultSQLiteColumn<{
            columnType: "SQLiteText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        provider: DefaultSQLiteColumn<{
            columnType: "SQLiteText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        providerAccountId: DefaultSQLiteColumn<{
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            notNull: true;
        }>;
        refresh_token: DefaultSQLiteColumn<{
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            notNull: boolean;
        }>;
        access_token: DefaultSQLiteColumn<{
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            notNull: boolean;
        }>;
        expires_at: DefaultSQLiteColumn<{
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            notNull: boolean;
        }>;
        token_type: DefaultSQLiteColumn<{
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            notNull: boolean;
        }>;
        scope: DefaultSQLiteColumn<{
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            notNull: boolean;
        }>;
        id_token: DefaultSQLiteColumn<{
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            notNull: boolean;
        }>;
        session_state: DefaultSQLiteColumn<{
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            notNull: boolean;
        }>;
    };
    dialect: "sqlite";
    schema: string | undefined;
}>;
export type DefaultSQLiteSessionsTable = SQLiteTableWithColumns<{
    name: string;
    columns: {
        sessionToken: DefaultSQLiteColumn<{
            columnType: "SQLiteText";
            data: string;
            isPrimaryKey: true;
            notNull: true;
            dataType: "string";
        }>;
        userId: DefaultSQLiteColumn<{
            columnType: "SQLiteText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        expires: DefaultSQLiteColumn<{
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            notNull: true;
        }>;
    };
    dialect: "sqlite";
    schema: string | undefined;
}>;
export type DefaultSQLiteVerificationTokenTable = SQLiteTableWithColumns<{
    name: string;
    columns: {
        identifier: DefaultSQLiteColumn<{
            columnType: "SQLiteText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        token: DefaultSQLiteColumn<{
            columnType: "SQLiteText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        expires: DefaultSQLiteColumn<{
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            notNull: true;
        }>;
    };
    dialect: "sqlite";
    schema: string | undefined;
}>;
export type DefaultSQLiteAuthenticatorTable = SQLiteTableWithColumns<{
    name: string;
    columns: {
        credentialID: DefaultSQLiteColumn<{
            columnType: "SQLiteText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        userId: DefaultSQLiteColumn<{
            columnType: "SQLiteText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        providerAccountId: DefaultSQLiteColumn<{
            columnType: "SQLiteText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        credentialPublicKey: DefaultSQLiteColumn<{
            columnType: "SQLiteText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        counter: DefaultSQLiteColumn<{
            columnType: "SQLiteInteger";
            data: number;
            notNull: true;
            dataType: "number";
        }>;
        credentialDeviceType: DefaultSQLiteColumn<{
            columnType: "SQLiteText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        credentialBackedUp: DefaultSQLiteColumn<{
            columnType: "SQLiteBoolean";
            data: boolean;
            notNull: true;
            dataType: "boolean";
        }>;
        transports: DefaultSQLiteColumn<{
            columnType: "SQLiteText";
            data: string;
            notNull: false;
            dataType: "string";
        }>;
    };
    dialect: "sqlite";
    schema: string | undefined;
}>;
export type DefaultSQLiteSchema = {
    usersTable: DefaultSQLiteUsersTable;
    accountsTable: DefaultSQLiteAccountsTable;
    sessionsTable?: DefaultSQLiteSessionsTable;
    verificationTokensTable?: DefaultSQLiteVerificationTokenTable;
    authenticatorsTable?: DefaultSQLiteAuthenticatorTable;
};
export {};
//# sourceMappingURL=sqlite.d.ts.map