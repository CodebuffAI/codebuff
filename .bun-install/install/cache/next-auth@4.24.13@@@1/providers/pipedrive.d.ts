import type { OAuthConfig, OAuthUserConfig } from ".";
export interface PipedriveProfile extends Record<string, any> {
    success: boolean;
    data: {
        id: number;
        name: string;
        default_currency?: string;
        locale?: string;
        lang?: number;
        email: string;
        phone?: string;
        activated?: boolean;
        last_login?: Date;
        created?: Date;
        modified?: Date;
        signup_flow_variation?: string;
        has_created_company?: boolean;
        is_admin?: number;
        active_flag?: boolean;
        timezone_name?: string;
        timezone_offset?: string;
        role_id?: number;
        icon_url?: string;
        is_you?: boolean;
        company_id?: number;
        company_name?: string;
        company_domain?: string;
        company_country?: string;
        company_industry?: string;
        language?: {
            language_code?: string;
            country_code?: string;
        };
    };
}
export default function Pipedrive<P extends PipedriveProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
//# sourceMappingURL=pipedrive.d.ts.map