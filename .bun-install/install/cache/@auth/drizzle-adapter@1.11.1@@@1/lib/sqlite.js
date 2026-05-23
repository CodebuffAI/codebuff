import { and, eq, getTableColumns } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text, } from "drizzle-orm/sqlite-core";
export function defineTables(schema = {}) {
    const usersTable = schema.usersTable ??
        (sqliteTable("user", {
            id: text("id")
                .primaryKey()
                .$defaultFn(() => crypto.randomUUID()),
            name: text("name"),
            email: text("email").unique(),
            emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
            image: text("image"),
        }));
    const accountsTable = schema.accountsTable ??
        (sqliteTable("account", {
            userId: text("userId")
                .notNull()
                .references(() => usersTable.id, { onDelete: "cascade" }),
            type: text("type").$type().notNull(),
            provider: text("provider").notNull(),
            providerAccountId: text("providerAccountId").notNull(),
            refresh_token: text("refresh_token"),
            access_token: text("access_token"),
            expires_at: integer("expires_at"),
            token_type: text("token_type"),
            scope: text("scope"),
            id_token: text("id_token"),
            session_state: text("session_state"),
        }, (account) => ({
            compositePk: primaryKey({
                columns: [account.provider, account.providerAccountId],
            }),
        })));
    const sessionsTable = schema.sessionsTable ??
        (sqliteTable("session", {
            sessionToken: text("sessionToken").primaryKey(),
            userId: text("userId")
                .notNull()
                .references(() => usersTable.id, { onDelete: "cascade" }),
            expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
        }));
    const verificationTokensTable = schema.verificationTokensTable ??
        (sqliteTable("verificationToken", {
            identifier: text("identifier").notNull(),
            token: text("token").notNull(),
            expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
        }, (verficationToken) => ({
            compositePk: primaryKey({
                columns: [verficationToken.identifier, verficationToken.token],
            }),
        })));
    const authenticatorsTable = schema.authenticatorsTable ??
        (sqliteTable("authenticator", {
            credentialID: text("credentialID").notNull().unique(),
            userId: text("userId")
                .notNull()
                .references(() => usersTable.id, { onDelete: "cascade" }),
            providerAccountId: text("providerAccountId").notNull(),
            credentialPublicKey: text("credentialPublicKey").notNull(),
            counter: integer("counter").notNull(),
            credentialDeviceType: text("credentialDeviceType").notNull(),
            credentialBackedUp: integer("credentialBackedUp", {
                mode: "boolean",
            }).notNull(),
            transports: text("transports"),
        }, (authenticator) => ({
            compositePK: primaryKey({
                columns: [authenticator.userId, authenticator.credentialID],
            }),
        })));
    return {
        usersTable,
        accountsTable,
        sessionsTable,
        verificationTokensTable,
        authenticatorsTable,
    };
}
export function SQLiteDrizzleAdapter(client, schema) {
    const { usersTable, accountsTable, sessionsTable, verificationTokensTable, authenticatorsTable, } = defineTables(schema);
    return {
        async createUser(data) {
            const { id, ...insertData } = data;
            const hasDefaultId = getTableColumns(usersTable)["id"]["hasDefault"];
            return client
                .insert(usersTable)
                .values(hasDefaultId ? insertData : { ...insertData, id })
                .returning()
                .get();
        },
        async getUser(userId) {
            const result = (await client
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, userId))
                .get()) ?? null;
            return result;
        },
        async getUserByEmail(email) {
            const result = (await client
                .select()
                .from(usersTable)
                .where(eq(usersTable.email, email))
                .get()) ?? null;
            return result;
        },
        async createSession(data) {
            return client.insert(sessionsTable).values(data).returning().get();
        },
        async getSessionAndUser(sessionToken) {
            const result = (await client
                .select({
                session: sessionsTable,
                user: usersTable,
            })
                .from(sessionsTable)
                .where(eq(sessionsTable.sessionToken, sessionToken))
                .innerJoin(usersTable, eq(usersTable.id, sessionsTable.userId))
                .get()) ?? null;
            return result;
        },
        async updateUser(data) {
            if (!data.id) {
                throw new Error("No user id.");
            }
            const result = await client
                .update(usersTable)
                .set(data)
                .where(eq(usersTable.id, data.id))
                .returning()
                .get();
            if (!result) {
                throw new Error("User not found.");
            }
            return result;
        },
        async updateSession(data) {
            const result = await client
                .update(sessionsTable)
                .set(data)
                .where(eq(sessionsTable.sessionToken, data.sessionToken))
                .returning()
                .get();
            return result ?? null;
        },
        async linkAccount(data) {
            await client.insert(accountsTable).values(data).run();
        },
        async getUserByAccount(account) {
            const result = await client
                .select({
                account: accountsTable,
                user: usersTable,
            })
                .from(accountsTable)
                .innerJoin(usersTable, eq(accountsTable.userId, usersTable.id))
                .where(and(eq(accountsTable.provider, account.provider), eq(accountsTable.providerAccountId, account.providerAccountId)))
                .get();
            const user = result?.user ?? null;
            return user;
        },
        async deleteSession(sessionToken) {
            await client
                .delete(sessionsTable)
                .where(eq(sessionsTable.sessionToken, sessionToken))
                .run();
        },
        async createVerificationToken(data) {
            return client
                .insert(verificationTokensTable)
                .values(data)
                .returning()
                .get();
        },
        async useVerificationToken(params) {
            const result = await client
                .delete(verificationTokensTable)
                .where(and(eq(verificationTokensTable.identifier, params.identifier), eq(verificationTokensTable.token, params.token)))
                .returning()
                .get();
            return result ?? null;
        },
        async deleteUser(id) {
            await client.delete(usersTable).where(eq(usersTable.id, id)).run();
        },
        async unlinkAccount(params) {
            await client
                .delete(accountsTable)
                .where(and(eq(accountsTable.provider, params.provider), eq(accountsTable.providerAccountId, params.providerAccountId)))
                .run();
        },
        async getAccount(providerAccountId, provider) {
            return client
                .select()
                .from(accountsTable)
                .where(and(eq(accountsTable.provider, provider), eq(accountsTable.providerAccountId, providerAccountId)))
                .then((res) => res[0] ?? null);
        },
        async createAuthenticator(data) {
            return client
                .insert(authenticatorsTable)
                .values(data)
                .returning()
                .then((res) => res[0] ?? null);
        },
        async getAuthenticator(credentialID) {
            return client
                .select()
                .from(authenticatorsTable)
                .where(eq(authenticatorsTable.credentialID, credentialID))
                .then((res) => res[0] ?? null);
        },
        async listAuthenticatorsByUserId(userId) {
            return client
                .select()
                .from(authenticatorsTable)
                .where(eq(authenticatorsTable.userId, userId))
                .then((res) => res);
        },
        async updateAuthenticatorCounter(credentialID, newCounter) {
            const authenticator = await client
                .update(authenticatorsTable)
                .set({ counter: newCounter })
                .where(eq(authenticatorsTable.credentialID, credentialID))
                .returning()
                .then((res) => res[0]);
            if (!authenticator)
                throw new Error("Authenticator not found.");
            return authenticator;
        },
    };
}
