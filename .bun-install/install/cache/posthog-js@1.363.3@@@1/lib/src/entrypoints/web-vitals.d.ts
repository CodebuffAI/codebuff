declare const postHogWebVitalsCallbacks: {
    onLCP: (onReport: (metric: import("web-vitals").LCPMetric) => void, opts?: import("web-vitals").ReportOpts) => void;
    onCLS: (onReport: (metric: import("web-vitals").CLSMetric) => void, opts?: import("web-vitals").ReportOpts) => void;
    onFCP: (onReport: (metric: import("web-vitals").FCPMetric) => void, opts?: import("web-vitals").ReportOpts) => void;
    onINP: (onReport: (metric: import("web-vitals").INPMetric) => void, opts?: import("web-vitals").INPReportOpts) => void;
};
export default postHogWebVitalsCallbacks;
