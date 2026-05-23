import { GeneratedColumnConfig } from "drizzle-orm";
import { PgColumn, PgDatabase, PgQueryResultHKT, PgTableWithColumns } from "drizzle-orm/pg-core";
import type { Adapter } from "@auth/core/adapters";
export declare function defineTables(schema?: Partial<DefaultPostgresSchema>): Required<DefaultPostgresSchema>;
export declare function PostgresDrizzleAdapter(client: PgDatabase<PgQueryResultHKT, any>, schema?: DefaultPostgresSchema): Adapter;
type DefaultPostgresColumn<T extends {
    data: string | number | boolean | Date;
    dataType: "string" | "number" | "boolean" | "date";
    notNull: boolean;
    isPrimaryKey?: boolean;
    columnType: "PgVarchar" | "PgText" | "PgBoolean" | "PgTimestamp" | "PgInteger" | "PgUUID";
}> = PgColumn<{
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
export type DefaultPostgresUsersTable = PgTableWithColumns<{
    name: string;
    columns: {
        id: DefaultPostgresColumn<{
            columnType: "PgVarchar" | "PgText" | "PgUUID";
            isPrimaryKey: true;
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        name: DefaultPostgresColumn<{
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: boolean;
            dataType: "string";
        }>;
        email: DefaultPostgresColumn<{
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: boolean;
            dataType: "string";
        }>;
        emailVerified: DefaultPostgresColumn<{
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            notNull: boolean;
        }>;
        image: DefaultPostgresColumn<{
            dataType: "string";
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: boolean;
        }>;
    };
    dialect: "pg";
    schema: string | undefined;
}>;
export type DefaultPostgresAccountsTable = PgTableWithColumns<{
    name: string;
    columns: {
        userId: DefaultPostgresColumn<{
            columnType: "PgVarchar" | "PgText" | "PgUUID";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        type: DefaultPostgresColumn<{
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        provider: DefaultPostgresColumn<{
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        providerAccountId: DefaultPostgresColumn<{
            dataType: "string";
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: true;
        }>;
        refresh_token: DefaultPostgresColumn<{
            dataType: "string";
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: boolean;
        }>;
        access_token: DefaultPostgresColumn<{
            dataType: "string";
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: boolean;
        }>;
        expires_at: DefaultPostgresColumn<{
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            notNull: boolean;
        }>;
        token_type: DefaultPostgresColumn<{
            dataType: "string";
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: boolean;
        }>;
        scope: DefaultPostgresColumn<{
            dataType: "string";
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: boolean;
        }>;
        id_token: DefaultPostgresColumn<{
            dataType: "string";
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: boolean;
        }>;
        session_state: DefaultPostgresColumn<{
            dataType: "string";
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: boolean;
        }>;
    };
    dialect: "pg";
    schema: string | undefined;
}>;
export type DefaultPostgresSessionsTable = PgTableWithColumns<{
    name: string;
    columns: {
        sessionToken: DefaultPostgresColumn<{
            columnType: "PgVarchar" | "PgText";
            data: string;
            isPrimaryKey: true;
            notNull: true;
            dataType: "string";
        }>;
        userId: DefaultPostgresColumn<{
            columnType: "PgVarchar" | "PgText" | "PgUUID";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        expires: DefaultPostgresColumn<{
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            notNull: true;
        }>;
    };
    dialect: "pg";
    schema: string | undefined;
}>;
export type DefaultPostgresVerificationTokenTable = PgTableWithColumns<{
    name: string;
    columns: {
        identifier: DefaultPostgresColumn<{
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        token: DefaultPostgresColumn<{
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        expires: DefaultPostgresColumn<{
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            notNull: true;
        }>;
    };
    dialect: "pg";
    schema: string | undefined;
}>;
export type DefaultPostgresAuthenticatorTable = PgTableWithColumns<{
    name: string;
    columns: {
        credentialID: DefaultPostgresColumn<{
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        userId: DefaultPostgresColumn<{
            columnType: "PgVarchar" | "PgText" | "PgUUID";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        providerAccountId: DefaultPostgresColumn<{
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        credentialPublicKey: DefaultPostgresColumn<{
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        counter: DefaultPostgresColumn<{
            columnType: "PgInteger";
            data: number;
            notNull: true;
            dataType: "number";
        }>;
        credentialDeviceType: DefaultPostgresColumn<{
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        credentialBackedUp: DefaultPostgresColumn<{
            columnType: "PgBoolean";
            data: boolean;
            notNull: true;
            dataType: "boolean";
        }>;
        transports: DefaultPostgresColumn<{
            columnType: "PgVarchar" | "PgText";
            data: string;
            notNull: false;
            dataType: "string";
        }>;
    };
    dialect: "pg";
    schema: string | undefined;
}>;
export type DefaultPostgresSchema = {
    usersTable: DefaultPostgresUsersTable;
    accountsTable: DefaultPostgresAccountsTable;
    sessionsTable?: DefaultPostgresSessionsTable;
    verificationTokensTable?: DefaultPostgresVerificationTokenTable;
    authenticatorsTable?: DefaultPostgresAuthenticatorTable;
};
export {};
//# sourceMappingURL=pg.d.ts.map