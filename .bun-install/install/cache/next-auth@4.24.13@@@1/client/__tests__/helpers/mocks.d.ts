export namespace mockSession {
    const ok: boolean;
    namespace user {
        const image: null;
        const name: string;
        const email: string;
    }
    const expires: number;
}
export namespace mockProviders {
    const ok_1: boolean;
    export { ok_1 as ok };
    export namespace github {
        export const id: string;
        const name_1: string;
        export { name_1 as name };
        export const type: string;
        export const signinUrl: string;
        export const callbackUrl: string;
    }
    export namespace credentials {
        const id_1: string;
        export { id_1 as id };
        const name_2: string;
        export { name_2 as name };
        const type_1: string;
        export { type_1 as type };
        export const authorize: null;
        const credentials_1: null;
        export { credentials_1 as credentials };
    }
    export namespace email_1 {
        const id_2: string;
        export { id_2 as id };
        const type_2: string;
        export { type_2 as type };
        const name_3: string;
        export { name_3 as name };
    }
    export { email_1 as email };
}
export namespace mockCSRFToken {
    const ok_2: boolean;
    export { ok_2 as ok };
    export const csrfToken: string;
}
export namespace mockGithubResponse {
    const ok_3: boolean;
    export { ok_3 as ok };
    export const status: number;
    export const url: string;
}
export namespace mockCredentialsResponse {
    const ok_4: boolean;
    export { ok_4 as ok };
    const status_1: number;
    export { status_1 as status };
    const url_1: string;
    export { url_1 as url };
}
export namespace mockEmailResponse {
    const ok_5: boolean;
    export { ok_5 as ok };
    const status_2: number;
    export { status_2 as status };
    const url_2: string;
    export { url_2 as url };
}
export namespace mockSignOutResponse {
    const ok_6: boolean;
    export { ok_6 as ok };
    const status_3: number;
    export { status_3 as status };
    const url_3: string;
    export { url_3 as url };
}
export const server: import("msw/lib/glossary-58eca5a8").z;
//# sourceMappingURL=mocks.d.ts.map