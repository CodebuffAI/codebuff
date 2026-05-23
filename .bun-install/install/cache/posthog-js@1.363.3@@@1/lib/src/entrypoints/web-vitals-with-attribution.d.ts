declare const postHogWebVitalsCallbacks: {
    onLCP: (onReport: (metric: import("web-vitals/attribution").LCPMetricWithAttribution) => void, opts?: import("web-vitals/attribution").AttributionReportOpts) => void;
    onCLS: (onReport: (metric: import("web-vitals/attribution").CLSMetricWithAttribution) => void, opts?: import("web-vitals/attribution").AttributionReportOpts) => void;
    onFCP: (onReport: (metric: import("web-vitals/attribution").FCPMetricWithAttribution) => void, opts?: import("web-vitals/attribution").AttributionReportOpts) => void;
    onINP: (onReport: (metric: import("web-vitals/attribution").INPMetricWithAttribution) => void, opts?: import("web-vitals/attribution").INPAttributionReportOpts) => void;
};
export default postHogWebVitalsCallbacks;
