import type { ErrorPageParam, Theme } from "../../types.js";
/**
 * The following errors are passed as error query parameters to the default or overridden error page.
 *
 * [Documentation](https://authjs.dev/guides/pages/error)
 */
export interface ErrorProps {
    url?: URL;
    theme?: Theme;
    error?: ErrorPageParam;
}
/** Renders an error page. */
export default function ErrorPage(props: ErrorProps): {
    status: number;
    html: import("preact").JSX.Element;
};
//# sourceMappingURL=error.d.ts.map