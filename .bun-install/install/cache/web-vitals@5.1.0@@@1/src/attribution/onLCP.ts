/*
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {getNavigationEntry} from '../lib/getNavigationEntry.js';
import {getSelector} from '../lib/getSelector.js';
import {initUnique} from '../lib/initUnique.js';
import {LCPEntryManager} from '../lib/LCPEntryManager.js';
import {onLCP as unattributedOnLCP} from '../onLCP.js';
import {
  LCPAttribution,
  LCPMetric,
  LCPMetricWithAttribution,
  AttributionReportOpts,
} from '../types.js';

/**
 * Calculates the [LCP](https://web.dev/articles/lcp) value for the current page and
 * calls the `callback` function once the value is ready (along with the
 * relevant `largest-contentful-paint` performance entry used to determine the
 * value). The reported value is a `DOMHighResTimeStamp`.
 *
 * If the `reportAllChanges` configuration option is set to `true`, the
 * `callback` function will be called any time a new `largest-contentful-paint`
 * performance entry is dispatched, or once the final value of the metric has
 * been determined.
 */
export const onLCP = (
  onReport: (metric: LCPMetricWithAttribution) => void,
  opts: AttributionReportOpts = {},
) => {
  // Clone the opts object to ensure it's unique, so we can initialize a
  // single instance of the `LCPEntryManager` class that's shared only with
  // this function invocation and the `unattributedOnLCP()` invocation below
  // (which is passed the same `opts` object).
  opts = Object.assign({}, opts);

  const lcpEntryManager = initUnique(opts, LCPEntryManager);
  const lcpTargetMap: WeakMap<LargestContentfulPaint, string> = new WeakMap();

  lcpEntryManager._onBeforeProcessingEntry = (
    entry: LargestContentfulPaint,
  ) => {
    const node = entry.element;
    if (node) {
      const customTarget = opts.generateTarget?.(node) ?? getSelector(node);
      lcpTargetMap.set(entry, customTarget);
    }
  };

  const attributeLCP = (metric: LCPMetric): LCPMetricWithAttribution => {
    // Use a default object if no other attribution has been set.
    let attribution: LCPAttribution = {
      timeToFirstByte: 0,
      resourceLoadDelay: 0,
      resourceLoadDuration: 0,
      elementRenderDelay: metric.value,
    };

    if (metric.entries.length) {
      const navigationEntry = getNavigationEntry();
      if (navigationEntry) {
        const activationStart = navigationEntry.activationStart || 0;
        // The `metric.entries.length` check ensures there will be an entry.
        const lcpEntry = metric.entries.at(-1)!;
        const lcpResourceEntry =
          lcpEntry.url &&
          performance
            .getEntriesByType('resource')
            .filter((e) => e.name === lcpEntry.url)[0];

        const ttfb = Math.max(
          0,
          navigationEntry.responseStart - activationStart,
        );

        const lcpRequestStart = Math.max(
          ttfb,
          // Prefer `requestStart` (if TOA is set), otherwise use `startTime`.
          lcpResourceEntry
            ? (lcpResourceEntry.requestStart || lcpResourceEntry.startTime) -
                activationStart
            : 0,
        );
        const lcpResponseEnd = Math.min(
          // Cap at LCP time (videos continue downloading after LCP for example)
          metric.value,
          Math.max(
            lcpRequestStart,
            lcpResourceEntry
              ? lcpResourceEntry.responseEnd - activationStart
              : 0,
          ),
        );

        attribution = {
          target: lcpTargetMap.get(lcpEntry),
          timeToFirstByte: ttfb,
          resourceLoadDelay: lcpRequestStart - ttfb,
          resourceLoadDuration: lcpResponseEnd - lcpRequestStart,
          elementRenderDelay: metric.value - lcpResponseEnd,
          navigationEntry,
          lcpEntry,
        };

        // Only attribute the URL and resource entry if they exist.
        if (lcpEntry.url) {
          attribution.url = lcpEntry.url;
        }
        if (lcpResourceEntry) {
          attribution.lcpResourceEntry = lcpResourceEntry;
        }
      }
    }

    // Use `Object.assign()` to ensure the original metric object is returned.
    const metricWithAttribution: LCPMetricWithAttribution = Object.assign(
      metric,
      {attribution},
    );
    return metricWithAttribution;
  };

  unattributedOnLCP((metric: LCPMetric) => {
    const metricWithAttribution = attributeLCP(metric);
    onReport(metricWithAttribution);
  }, opts);
};
