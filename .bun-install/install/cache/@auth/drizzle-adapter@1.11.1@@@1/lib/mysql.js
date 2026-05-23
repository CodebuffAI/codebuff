import { and, eq, getTableColumns } from "drizzle-orm";
import { boolean, int, mysqlTable, primaryKey, timestamp, varchar, } from "drizzle-orm/mysql-core";
export function defineTables(schema = {}) {
    const usersTable = schema.usersTable ??
        (mysqlTable("user", {
            id: varchar("id", { length: 255 })
                .primaryKey()
                .$defaultFn(() => crypto.randomUUID()),
            name: varchar("name", { length: 255 }),
            email: varchar("email", { length: 255 }).unique(),
            emailVerified: timestamp("emailVerified", { mode: "date", fsp: 3 }),
            image: varchar("image", { length: 255 }),
        }));
    const accountsTable = schema.accountsTable ??
        (mysqlTable("account", {
            userId: varchar("userId", { length: 255 })
                .notNull()
                .references(() => usersTable.id, { onDelete: "cascade" }),
            type: varchar("type", { length: 255 })
                .$type()
                .notNull(),
            provider: varchar("provider", { length: 255 }).notNull(),
            providerAccountId: varchar("providerAccountId", {
                length: 255,
            }).notNull(),
            refresh_token: varchar("refresh_token", { length: 255 }),
            access_token: varchar("access_token", { length: 255 }),
            expires_at: int("expires_at"),
            token_type: varchar("token_type", { length: 255 }),
            scope: varchar("scope", { length: 255 }),
            id_token: varchar("id_token", { length: 2048 }),
            session_state: varchar("session_state", { length: 255 }),
        }, (account) => ({
            compositePk: primaryKey({
                columns: [account.provider, account.providerAccountId],
            }),
        })));
    const sessionsTable = schema.sessionsTable ??
        (mysqlTable("session", {
            sessionToken: varchar("sessionToken", { length: 255 }).primaryKey(),
            userId: varchar("userId", { length: 255 })
                .notNull()
                .references(() => usersTable.id, { onDelete: "cascade" }),
            expires: timestamp("expires", { mode: "date" }).notNull(),
        }));
    const verificationTokensTable = schema.verificationTokensTable ??
        (mysqlTable("verificationToken", {
            identifier: varchar("identifier", { length: 255 }).notNull(),
            token: varchar("token", { length: 255 }).notNull(),
            expires: timestamp("expires", { mode: "date" }).notNull(),
        }, (verficationToken) => ({
            compositePk: primaryKey({
                columns: [verficationToken.identifier, verficationToken.token],
            }),
        })));
    const authenticatorsTable = schema.authenticatorsTable ??
        (mysqlTable("authenticator", {
            credentialID: varchar("credentialID", { length: 255 })
                .notNull()
                .unique(),
            userId: varchar("userId", { length: 255 })
                .notNull()
                .references(() => usersTable.id, { onDelete: "cascade" }),
            providerAccountId: varchar("providerAccountId", {
                length: 255,
            }).notNull(),
            credentialPublicKey: varchar("credentialPublicKey", {
                length: 255,
            }).notNull(),
            counter: int("counter").notNull(),
            credentialDeviceType: varchar("credentialDeviceType", {
                length: 255,
            }).notNull(),
            credentialBackedUp: boolean("credentialBackedUp").notNull(),
            transports: varchar("transports", { length: 255 }),
        }, (authenticator) => ({
            compositePk: primaryKey({
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
export function MySqlDrizzleAdapter(client, schema) {
    const { usersTable, accountsTable, sessionsTable, verificationTokensTable, authenticatorsTable, } = defineTables(schema);
    return {
        async createUser(data) {
            const { id, ...insertData } = data;
            const hasDefaultId = getTableColumns(usersTable)["id"]["defaultFn"];
            const [insertedUser] = (await client
                .insert(usersTable)
                .values(hasDefaultId ? insertData : { ...insertData, id })
                .$returningId());
            return client
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, insertedUser ? insertedUser.id : id))
                .then((res) => res[0]);
        },
        async getUser(userId) {
            return client
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, userId))
                .then((res) => res.length > 0 ? res[0] : null);
        },
        async getUserByEmail(email) {
            return client
                .select()
                .from(usersTable)
                .where(eq(usersTable.email, email))
                .then((res) => res.length > 0 ? res[0] : null);
        },
        async createSession(data) {
            await client.insert(sessionsTable).values(data);
            return client
                .select()
                .from(sessionsTable)
                .where(eq(sessionsTable.sessionToken, data.sessionToken))
                .then((res) => res[0]);
        },
        async getSessionAndUser(sessionToken) {
            return client
                .select({
                session: sessionsTable,
                user: usersTable,
            })
                .from(sessionsTable)
                .where(eq(sessionsTable.sessionToken, sessionToken))
                .innerJoin(usersTable, eq(usersTable.id, sessionsTable.userId))
                .then((res) => (res.length > 0 ? res[0] : null));
        },
        async updateUser(data) {
            if (!data.id) {
                throw new Error("No user id.");
            }
            await client
                .update(usersTable)
                .set(data)
                .where(eq(usersTable.id, data.id));
            const [result] = await client
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, data.id));
            if (!result) {
                throw new Error("No user found.");
            }
            return result;
        },
        async updateSession(data) {
            await client
                .update(sessionsTable)
                .set(data)
                .where(eq(sessionsTable.sessionToken, data.sessionToken));
            return client
                .select()
                .from(sessionsTable)
                .where(eq(sessionsTable.sessionToken, data.sessionToken))
                .then((res) => res[0]);
        },
        async linkAccount(data) {
            await client.insert(accountsTable).values(data);
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
                .then((res) => res[0]);
            const user = result?.user ?? null;
            return user;
        },
        async deleteSession(sessionToken) {
            await client
                .delete(sessionsTable)
                .where(eq(sessionsTable.sessionToken, sessionToken));
        },
        async createVerificationToken(data) {
            await client.insert(verificationTokensTable).values(data);
            return client
                .select()
                .from(verificationTokensTable)
                .where(eq(verificationTokensTable.identifier, data.identifier))
                .then((res) => res[0]);
        },
        async useVerificationToken(params) {
            const deletedToken = await client
                .select()
                .from(verificationTokensTable)
                .where(and(eq(verificationTokensTable.identifier, params.identifier), eq(verificationTokensTable.token, params.token)))
                .then((res) => (res.length > 0 ? res[0] : null));
            if (deletedToken) {
                await client
                    .delete(verificationTokensTable)
                    .where(and(eq(verificationTokensTable.identifier, params.identifier), eq(verificationTokensTable.token, params.token)));
            }
            return deletedToken;
        },
        async deleteUser(id) {
            await client.delete(usersTable).where(eq(usersTable.id, id));
        },
        async unlinkAccount(params) {
            await client
                .delete(accountsTable)
                .where(and(eq(accountsTable.provider, params.provider), eq(accountsTable.providerAccountId, params.providerAccountId)));
        },
        async getAccount(providerAccountId, provider) {
            return client
                .select()
                .from(accountsTable)
                .where(and(eq(accountsTable.provider, provider), eq(accountsTable.providerAccountId, providerAccountId)))
                .then((res) => res[0] ?? null);
        },
        async createAuthenticator(data) {
            await client.insert(authenticatorsTable).values(data);
            return (await client
                .select()
                .from(authenticatorsTable)
                .where(eq(authenticatorsTable.credentialID, data.credentialID))
                .then((res) => res[0] ?? null));
        },
        async getAuthenticator(credentialID) {
            return (await client
                .select()
                .from(authenticatorsTable)
                .where(eq(authenticatorsTable.credentialID, credentialID))
                .then((res) => res[0] ?? null));
        },
        async listAuthenticatorsByUserId(userId) {
            return (await client
                .select()
                .from(authenticatorsTable)
                .where(eq(authenticatorsTable.userId, userId))
                .then((res) => res));
        },
        async updateAuthenticatorCounter(credentialID, newCounter) {
            await client
                .update(authenticatorsTable)
                .set({ counter: newCounter })
                .where(eq(authenticatorsTable.credentialID, credentialID));
            const authenticator = await client
                .select()
                .from(authenticatorsTable)
                .where(eq(authenticatorsTable.credentialID, credentialID))
                .then((res) => res[0]);
            if (!authenticator)
                throw new Error("Authenticator not found.");
            return authenticator;
        },
    };
}
