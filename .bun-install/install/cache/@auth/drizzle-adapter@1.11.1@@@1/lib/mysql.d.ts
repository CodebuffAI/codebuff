import { GeneratedColumnConfig } from "drizzle-orm";
import { MySqlColumn, MySqlDatabase, PreparedQueryHKTBase, MySqlTableWithColumns, MySqlQueryResultHKT } from "drizzle-orm/mysql-core";
import type { Adapter } from "@auth/core/adapters";
export declare function defineTables(schema?: Partial<DefaultMySqlSchema>): Required<DefaultMySqlSchema>;
export declare function MySqlDrizzleAdapter(client: MySqlDatabase<MySqlQueryResultHKT, PreparedQueryHKTBase, any>, schema?: DefaultMySqlSchema): Adapter;
type DefaultMyqlColumn<T extends {
    data: string | number | boolean | Date;
    dataType: "string" | "number" | "boolean" | "date";
    notNull: boolean;
    isPrimaryKey?: boolean;
    columnType: "MySqlVarChar" | "MySqlText" | "MySqlBoolean" | "MySqlTimestamp" | "MySqlInt";
}> = MySqlColumn<{
    isAutoincrement: boolean;
    isPrimaryKey: T["isPrimaryKey"] extends true ? true : false;
    hasRuntimeDefault: boolean;
    generated: GeneratedColumnConfig<T["data"]> | undefined;
    name: string;
    columnType: T["columnType"];
    data: T["data"];
    driverParam: string | number | boolean;
    notNull: T["notNull"];
    hasDefault: boolean;
    enumValues: any;
    dataType: T["dataType"];
    tableName: string;
}>;
export type DefaultMySqlUsersTable = MySqlTableWithColumns<{
    name: string;
    columns: {
        id: DefaultMyqlColumn<{
            isPrimaryKey: true;
            data: string;
            dataType: "string";
            notNull: true;
            columnType: "MySqlVarChar" | "MySqlText";
        }>;
        name: DefaultMyqlColumn<{
            data: string;
            dataType: "string";
            notNull: boolean;
            columnType: "MySqlVarChar" | "MySqlText";
        }>;
        email: DefaultMyqlColumn<{
            data: string;
            dataType: "string";
            notNull: boolean;
            columnType: "MySqlVarChar" | "MySqlText";
        }>;
        emailVerified: DefaultMyqlColumn<{
            data: Date;
            dataType: "date";
            notNull: boolean;
            columnType: "MySqlTimestamp";
        }>;
        image: DefaultMyqlColumn<{
            data: string;
            dataType: "string";
            notNull: boolean;
            columnType: "MySqlVarChar" | "MySqlText";
        }>;
    };
    dialect: "mysql";
    schema: string | undefined;
}>;
export type DefaultMySqlAccountsTable = MySqlTableWithColumns<{
    name: string;
    columns: {
        userId: DefaultMyqlColumn<{
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        type: DefaultMyqlColumn<{
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        provider: DefaultMyqlColumn<{
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        providerAccountId: DefaultMyqlColumn<{
            dataType: "string";
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: true;
        }>;
        refresh_token: DefaultMyqlColumn<{
            dataType: "string";
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: boolean;
        }>;
        access_token: DefaultMyqlColumn<{
            dataType: "string";
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            driverParam: string | number;
            notNull: boolean;
        }>;
        expires_at: DefaultMyqlColumn<{
            dataType: "number";
            columnType: "MySqlInt";
            data: number;
            notNull: boolean;
        }>;
        token_type: DefaultMyqlColumn<{
            dataType: "string";
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: boolean;
        }>;
        scope: DefaultMyqlColumn<{
            dataType: "string";
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: boolean;
        }>;
        id_token: DefaultMyqlColumn<{
            dataType: "string";
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: boolean;
        }>;
        session_state: DefaultMyqlColumn<{
            dataType: "string";
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: boolean;
        }>;
    };
    dialect: "mysql";
    schema: string | undefined;
}>;
export type DefaultMySqlSessionsTable = MySqlTableWithColumns<{
    name: string;
    columns: {
        sessionToken: DefaultMyqlColumn<{
            isPrimaryKey: true;
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        userId: DefaultMyqlColumn<{
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        expires: DefaultMyqlColumn<{
            dataType: "date";
            columnType: "MySqlTimestamp";
            data: Date;
            notNull: true;
        }>;
    };
    dialect: "mysql";
    schema: string | undefined;
}>;
export type DefaultMySqlVerificationTokenTable = MySqlTableWithColumns<{
    name: string;
    columns: {
        identifier: DefaultMyqlColumn<{
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        token: DefaultMyqlColumn<{
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        expires: DefaultMyqlColumn<{
            dataType: "date";
            columnType: "MySqlTimestamp";
            data: Date;
            notNull: true;
        }>;
    };
    dialect: "mysql";
    schema: string | undefined;
}>;
export type DefaultMySqlAuthenticatorTable = MySqlTableWithColumns<{
    name: string;
    columns: {
        credentialID: DefaultMyqlColumn<{
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        userId: DefaultMyqlColumn<{
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        providerAccountId: DefaultMyqlColumn<{
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        credentialPublicKey: DefaultMyqlColumn<{
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        counter: DefaultMyqlColumn<{
            columnType: "MySqlInt";
            data: number;
            notNull: true;
            dataType: "number";
        }>;
        credentialDeviceType: DefaultMyqlColumn<{
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: true;
            dataType: "string";
        }>;
        credentialBackedUp: DefaultMyqlColumn<{
            columnType: "MySqlBoolean";
            data: boolean;
            notNull: true;
            dataType: "boolean";
        }>;
        transports: DefaultMyqlColumn<{
            columnType: "MySqlVarChar" | "MySqlText";
            data: string;
            notNull: false;
            dataType: "string";
        }>;
    };
    dialect: "mysql";
    schema: string | undefined;
}>;
export type DefaultMySqlSchema = {
    usersTable: DefaultMySqlUsersTable;
    accountsTable: DefaultMySqlAccountsTable;
    sessionsTable?: DefaultMySqlSessionsTable;
    verificationTokensTable?: DefaultMySqlVerificationTokenTable;
    authenticatorsTable?: DefaultMySqlAuthenticatorTable;
};
export {};
//# sourceMappingURL=mysql.d.ts.map