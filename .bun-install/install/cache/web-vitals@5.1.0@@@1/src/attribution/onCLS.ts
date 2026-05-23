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

import {LayoutShiftManager} from '../lib/LayoutShiftManager.js';
import {getLoadState} from '../lib/getLoadState.js';
import {getSelector} from '../lib/getSelector.js';
import {initUnique} from '../lib/initUnique.js';
import {onCLS as unattributedOnCLS} from '../onCLS.js';
import {
  CLSAttribution,
  CLSMetric,
  CLSMetricWithAttribution,
  AttributionReportOpts,
} from '../types.js';

const getLargestLayoutShiftEntry = (entries: LayoutShift[]) => {
  return entries.reduce((a, b) => (a.value > b.value ? a : b));
};

const getLargestLayoutShiftSource = (sources: LayoutShiftAttribution[]) => {
  return sources.find((s) => s.node?.nodeType === 1) || sources[0];
};

/**
 * Calculates the [CLS](https://web.dev/articles/cls) value for the current page and
 * calls the `callback` function once the value is ready to be reported, along
 * with all `layout-shift` performance entries that were used in the metric
 * value calculation. The reported value is a `double` (corresponding to a
 * [layout shift score](https://web.dev/articles/cls#layout_shift_score)).
 *
 * If the `reportAllChanges` configuration option is set to `true`, the
 * `callback` function will be called as soon as the value is initially
 * determined as well as any time the value changes throughout the page
 * lifespan.
 *
 * _**Important:** CLS should be continually monitored for changes throughout
 * the entire lifespan of a page—including if the user returns to the page after
 * it's been hidden/backgrounded. However, since browsers often [will not fire
 * additional callbacks once the user has backgrounded a
 * page](https://developer.chrome.com/blog/page-lifecycle-api/#advice-hidden),
 * `callback` is always called when the page's visibility state changes to
 * hidden. As a result, the `callback` function might be called multiple times
 * during the same page load._
 */
export const onCLS = (
  onReport: (metric: CLSMetricWithAttribution) => void,
  opts: AttributionReportOpts = {},
) => {
  // Clone the opts object to ensure it's unique, so we can initialize a
  // single instance of the `LayoutShiftManager` class that's shared only with
  // this function invocation and the `unattributedOnCLS()` invocation below
  // (which is passed the same `opts` object).
  opts = Object.assign({}, opts);

  const layoutShiftManager = initUnique(opts, LayoutShiftManager);
  const layoutShiftTargetMap: WeakMap<LayoutShiftAttribution, string> =
    new WeakMap();

  layoutShiftManager._onAfterProcessingUnexpectedShift = (
    entry: LayoutShift,
  ) => {
    if (entry?.sources?.length) {
      const largestSource = getLargestLayoutShiftSource(entry.sources);
      const node = largestSource?.node;
      if (node) {
        const customTarget = opts.generateTarget?.(node) ?? getSelector(node);
        layoutShiftTargetMap.set(largestSource, customTarget);
      }
    }
  };

  const attributeCLS = (metric: CLSMetric): CLSMetricWithAttribution => {
    // Use an empty object if no other attribution has been set.
    let attribution: CLSAttribution = {};

    if (metric.entries.length) {
      const largestEntry = getLargestLayoutShiftEntry(metric.entries);
      if (largestEntry?.sources?.length) {
        const largestSource = getLargestLayoutShiftSource(largestEntry.sources);
        if (largestSource) {
          attribution = {
            largestShiftTarget: layoutShiftTargetMap.get(largestSource),
            largestShiftTime: largestEntry.startTime,
            largestShiftValue: largestEntry.value,
            largestShiftSource: largestSource,
            largestShiftEntry: largestEntry,
            loadState: getLoadState(largestEntry.startTime),
          };
        }
      }
    }

    // Use `Object.assign()` to ensure the original metric object is returned.
    const metricWithAttribution: CLSMetricWithAttribution = Object.assign(
      metric,
      {attribution},
    );
    return metricWithAttribution;
  };

  unattributedOnCLS((metric: CLSMetric) => {
    const metricWithAttribution = attributeCLS(metric);
    onReport(metricWithAttribution);
  }, opts);
};
