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

import {getLoadState} from '../lib/getLoadState.js';
import {getSelector} from '../lib/getSelector.js';
import {initUnique} from '../lib/initUnique.js';
import {InteractionManager, Interaction} from '../lib/InteractionManager.js';
import {observe} from '../lib/observe.js';
import {whenIdleOrHidden} from '../lib/whenIdleOrHidden.js';
import {onINP as unattributedOnINP} from '../onINP.js';
import {
  INPAttribution,
  INPAttributionReportOpts,
  INPMetric,
  INPMetricWithAttribution,
  INPLongestScriptSummary,
} from '../types.js';

interface pendingEntriesGroup {
  startTime: DOMHighResTimeStamp;
  processingStart: DOMHighResTimeStamp;
  processingEnd: DOMHighResTimeStamp;
  renderTime: DOMHighResTimeStamp;
  entries: PerformanceEventTiming[];
}

// The maximum number of previous frames for which data is kept.
// Storing data about previous frames is necessary to handle cases where event
// and LoAF entries are dispatched out of order, and so a buffer of previous
// frame data is needed to determine various bits of INP attribution once all
// the frame-related data has come in.
// In most cases this out-of-order data is only off by a frame or two, so
// keeping the most recent 50 should be more than sufficient.
const MAX_PREVIOUS_FRAMES = 50;

/**
 * Calculates the [INP](https://web.dev/articles/inp) value for the current
 * page and calls the `callback` function once the value is ready, along with
 * the `event` performance entries reported for that interaction. The reported
 * value is a `DOMHighResTimeStamp`.
 *
 * A custom `durationThreshold` configuration option can optionally be passed
 * to control what `event-timing` entries are considered for INP reporting. The
 * default threshold is `40`, which means INP scores of less than 40 will not
 * be reported. To avoid reporting no interactions in these cases, the library
 * will fall back to the input delay of the first interaction. Note that this
 * will not affect your 75th percentile INP value unless that value is also
 * less than 40 (well below the recommended
 * [good](https://web.dev/articles/inp#what_is_a_good_inp_score) threshold).
 *
 * If the `reportAllChanges` configuration option is set to `true`, the
 * `callback` function will be called as soon as the value is initially
 * determined as well as any time the value changes throughout the page
 * lifespan.
 *
 * _**Important:** INP should be continually monitored for changes throughout
 * the entire lifespan of a page—including if the user returns to the page after
 * it has been hidden/backgrounded. However, since browsers often [will not fire
 * additional callbacks once the user has backgrounded a
 * page](https://developer.chrome.com/blog/page-lifecycle-api/#advice-hidden),
 * `callback` is always called when the page's visibility state changes to
 * hidden. As a result, the `callback` function might be called multiple times
 * during the same page load._
 */
export const onINP = (
  onReport: (metric: INPMetricWithAttribution) => void,
  opts: INPAttributionReportOpts = {},
) => {
  // Clone the opts object to ensure it's unique, so we can initialize a
  // single instance of the `InteractionManager` class that's shared only with
  // this function invocation and the `unattributedOnINP()` invocation below
  // (which is passed the same `opts` object).
  opts = Object.assign({}, opts);

  const interactionManager = initUnique(opts, InteractionManager);

  // A list of LoAF entries that have been dispatched and could potentially
  // intersect with the INP candidate interaction. Note that periodically this
  // list is cleaned up and entries that are known to not match INP are removed.
  let pendingLoAFs: PerformanceLongAnimationFrameTiming[] = [];

  // An array of groups of all the event timing entries that occurred within a
  // particular frame. Note that periodically this array is cleaned up and entries
  // that are known to not match INP are removed.
  let pendingEntriesGroups: pendingEntriesGroup[] = [];

  // The `processingEnd` time of most recently-processed event, chronologically.
  let latestProcessingEnd: number = 0;

  // A WeakMap to look up the event-timing-entries group of a given entry.
  // Note that this only maps from "important" entries: either the first input or
  // those with an `interactionId`.
  const entryToEntriesGroupMap: WeakMap<
    PerformanceEventTiming,
    pendingEntriesGroup
  > = new WeakMap();

  // A mapping of interactionIds to the target Node.
  const interactionTargetMap: WeakMap<Interaction, string> = new WeakMap();

  // A boolean flag indicating whether or not a cleanup task has been queued.
  let cleanupPending = false;

  /**
   * Adds new LoAF entries to the `pendingLoAFs` list.
   */
  const handleLoAFEntries = (
    entries: PerformanceLongAnimationFrameTiming[],
  ) => {
    pendingLoAFs = pendingLoAFs.concat(entries);
    queueCleanup();
  };

  const saveInteractionTarget = (interaction: Interaction) => {
    if (!interactionTargetMap.get(interaction)) {
      const node = interaction.entries[0].target;
      if (node) {
        const customTarget = opts.generateTarget?.(node) ?? getSelector(node);
        interactionTargetMap.set(interaction, customTarget);
      }
    }
  };

  /**
   * Groups entries that were presented within the same animation frame by
   * a common `renderTime`. This function works by referencing
   * `pendingEntriesGroups` and using an existing render time if one is found
   * (otherwise creating a new one). This function also adds all interaction
   * entries to an `entryToRenderTimeMap` WeakMap so that the "grouped" entries
   * can be looked up later.
   */
  const groupEntriesByRenderTime = (entry: PerformanceEventTiming) => {
    const renderTime = entry.startTime + entry.duration;
    let group;

    latestProcessingEnd = Math.max(latestProcessingEnd, entry.processingEnd);

    // Iterate over all previous render times in reverse order to find a match.
    // Go in reverse since the most likely match will be at the end.
    for (let i = pendingEntriesGroups.length - 1; i >= 0; i--) {
      const potentialGroup = pendingEntriesGroups[i];

      // If a group's render time is within 8ms of the entry's render time,
      // assume they were part of the same frame and add it to the group.
      if (Math.abs(renderTime - potentialGroup.renderTime) <= 8) {
        group = potentialGroup;
        group.startTime = Math.min(entry.startTime, group.startTime);
        group.processingStart = Math.min(
          entry.processingStart,
          group.processingStart,
        );
        group.processingEnd = Math.max(
          entry.processingEnd,
          group.processingEnd,
        );
        group.entries.push(entry);

        break;
      }
    }

    // If there was no matching group, assume this is a new frame.
    if (!group) {
      group = {
        startTime: entry.startTime,
        processingStart: entry.processingStart,
        processingEnd: entry.processingEnd,
        renderTime,
        entries: [entry],
      };

      pendingEntriesGroups.push(group);
    }

    // Store the grouped render time for this entry for reference later.
    if (entry.interactionId || entry.entryType === 'first-input') {
      entryToEntriesGroupMap.set(entry, group);
    }

    queueCleanup();
  };

  const queueCleanup = () => {
    // Queue cleanup of entries that are not part of any INP candidates.
    if (!cleanupPending) {
      whenIdleOrHidden(cleanupEntries);
      cleanupPending = true;
    }
  };

  const cleanupEntries = () => {
    // Keep all render times that are part of a pending INP candidate or
    // that occurred within the 50 most recently-dispatched groups of events.
    const longestInteractionGroups =
      interactionManager._longestInteractionList.map((i) => {
        return entryToEntriesGroupMap.get(i.entries[0]);
      });
    const minIndex = pendingEntriesGroups.length - MAX_PREVIOUS_FRAMES;
    pendingEntriesGroups = pendingEntriesGroups.filter((group, index) => {
      if (index >= minIndex) return true;
      return longestInteractionGroups.includes(group);
    });

    // Keep all pending LoAF entries that either:
    // 1) intersect with entries in the newly cleaned up `pendingEntriesGroups`
    // 2) occur after the most recently-processed event entry (for up to MAX_PREVIOUS_FRAMES)
    const loafsToKeep: Set<PerformanceLongAnimationFrameTiming> = new Set();
    for (const group of pendingEntriesGroups) {
      const loafs = getIntersectingLoAFs(group.startTime, group.processingEnd);
      for (const loaf of loafs) {
        loafsToKeep.add(loaf);
      }
    }
    const prevFrameIndexCutoff = pendingLoAFs.length - 1 - MAX_PREVIOUS_FRAMES;
    // Filter `pendingLoAFs` to preserve LoAF order.
    pendingLoAFs = pendingLoAFs.filter((loaf, index) => {
      if (
        loaf.startTime > latestProcessingEnd &&
        index > prevFrameIndexCutoff
      ) {
        return true;
      }

      return loafsToKeep.has(loaf);
    });

    cleanupPending = false;
  };

  interactionManager._onBeforeProcessingEntry = groupEntriesByRenderTime;
  interactionManager._onAfterProcessingINPCandidate = saveInteractionTarget;

  const getIntersectingLoAFs = (
    start: DOMHighResTimeStamp,
    end: DOMHighResTimeStamp,
  ) => {
    const intersectingLoAFs: PerformanceLongAnimationFrameTiming[] = [];

    for (const loaf of pendingLoAFs) {
      // If the LoAF ends before the given start time, ignore it.
      if (loaf.startTime + loaf.duration < start) continue;

      // If the LoAF starts after the given end time, ignore it and all
      // subsequent pending LoAFs (because they're in time order).
      if (loaf.startTime > end) break;

      // Still here? If so this LoAF intersects with the interaction.
      intersectingLoAFs.push(loaf);
    }
    return intersectingLoAFs;
  };

  const attributeLoAFDetails = (attribution: INPAttribution) => {
    // If there is no LoAF data then nothing further to attribute
    if (!attribution.longAnimationFrameEntries?.length) {
      return;
    }

    const interactionTime = attribution.interactionTime;
    const inputDelay = attribution.inputDelay;
    const processingDuration = attribution.processingDuration;

    // Stats across all LoAF entries and scripts.
    let totalScriptDuration = 0;
    let totalStyleAndLayoutDuration = 0;
    let totalPaintDuration = 0;
    let longestScriptDuration = 0;
    let longestScriptEntry: PerformanceScriptTiming | undefined;
    let longestScriptSubpart: INPLongestScriptSummary['subpart'] | undefined;

    for (const loafEntry of attribution.longAnimationFrameEntries) {
      totalStyleAndLayoutDuration =
        totalStyleAndLayoutDuration +
        loafEntry.startTime +
        loafEntry.duration -
        loafEntry.styleAndLayoutStart;

      for (const script of loafEntry.scripts) {
        const scriptEndTime = script.startTime + script.duration;
        if (scriptEndTime < interactionTime) {
          continue;
        }
        const intersectingScriptDuration =
          scriptEndTime - Math.max(interactionTime, script.startTime);
        // Since forcedStyleAndLayoutDuration doesn't provide timestamps, we
        // apportion the total based on the intersectingScriptDuration. Not
        // correct depending on when it occurred, but the best we can do.
        const intersectingForceStyleAndLayoutDuration = script.duration
          ? (intersectingScriptDuration / script.duration) *
            script.forcedStyleAndLayoutDuration
          : 0;
        // For scripts we exclude forcedStyleAndLayout (same as DevTools does
        // in its summary totals) and instead include that in
        // totalStyleAndLayoutDuration
        totalScriptDuration +=
          intersectingScriptDuration - intersectingForceStyleAndLayoutDuration;
        totalStyleAndLayoutDuration += intersectingForceStyleAndLayoutDuration;

        if (intersectingScriptDuration > longestScriptDuration) {
          // Set the subpart this occurred in.
          longestScriptSubpart =
            script.startTime < interactionTime + inputDelay
              ? 'input-delay'
              : script.startTime >=
                  interactionTime + inputDelay + processingDuration
                ? 'presentation-delay'
                : 'processing-duration';

          longestScriptEntry = script;
          longestScriptDuration = intersectingScriptDuration;
        }
      }
    }

    // Calculate the totalPaintDuration from the last LoAF after
    // presentationDelay starts (where available)
    const lastLoAF = attribution.longAnimationFrameEntries.at(-1);
    const lastLoAFEndTime = lastLoAF
      ? lastLoAF.startTime + lastLoAF.duration
      : 0;
    if (lastLoAFEndTime >= interactionTime + inputDelay + processingDuration) {
      totalPaintDuration = attribution.nextPaintTime - lastLoAFEndTime;
    }

    if (longestScriptEntry && longestScriptSubpart) {
      attribution.longestScript = {
        entry: longestScriptEntry,
        subpart: longestScriptSubpart,
        intersectingDuration: longestScriptDuration,
      };
    }
    attribution.totalScriptDuration = totalScriptDuration;
    attribution.totalStyleAndLayoutDuration = totalStyleAndLayoutDuration;
    attribution.totalPaintDuration = totalPaintDuration;
    attribution.totalUnattributedDuration =
      attribution.nextPaintTime -
      interactionTime -
      totalScriptDuration -
      totalStyleAndLayoutDuration -
      totalPaintDuration;
  };

  const attributeINP = (metric: INPMetric): INPMetricWithAttribution => {
    const firstEntry = metric.entries[0];
    const group = entryToEntriesGroupMap.get(firstEntry)!;

    const processingStart = firstEntry.processingStart;

    // Due to the fact that durations can be rounded down to the nearest 8ms,
    // we have to clamp `nextPaintTime` so it doesn't appear to occur before
    // processing starts. Note: we can't use `processingEnd` since processing
    // can extend beyond the event duration in some cases (see next comment).
    const nextPaintTime = Math.max(
      firstEntry.startTime + firstEntry.duration,
      processingStart,
    );

    // For the purposes of attribution, clamp `processingEnd` to `nextPaintTime`,
    // so processing is never reported as taking longer than INP (which can
    // happen via the web APIs in the case of sync modals, e.g. `alert()`).
    // See: https://github.com/GoogleChrome/web-vitals/issues/492
    const processingEnd = Math.min(group.processingEnd, nextPaintTime);

    // Sort the entries in processing time order.
    const processedEventEntries = group.entries.sort((a, b) => {
      return a.processingStart - b.processingStart;
    });

    const longAnimationFrameEntries: PerformanceLongAnimationFrameTiming[] =
      getIntersectingLoAFs(firstEntry.startTime, processingEnd);

    const interaction = interactionManager._longestInteractionMap.get(
      firstEntry.interactionId,
    );

    const attribution: INPAttribution = {
      // TS flags the next line because `interactionTargetMap.get()` might
      // return `undefined`, but we ignore this assuming the user knows what
      // they are doing.
      interactionTarget: interactionTargetMap.get(interaction!)!,
      interactionType: firstEntry.name.startsWith('key')
        ? 'keyboard'
        : 'pointer',
      interactionTime: firstEntry.startTime,
      nextPaintTime: nextPaintTime,
      processedEventEntries: processedEventEntries,
      longAnimationFrameEntries: longAnimationFrameEntries,
      inputDelay: processingStart - firstEntry.startTime,
      processingDuration: processingEnd - processingStart,
      presentationDelay: nextPaintTime - processingEnd,
      loadState: getLoadState(firstEntry.startTime),
      longestScript: undefined,
      totalScriptDuration: undefined,
      totalStyleAndLayoutDuration: undefined,
      totalPaintDuration: undefined,
      totalUnattributedDuration: undefined,
    };

    attributeLoAFDetails(attribution);

    // Use `Object.assign()` to ensure the original metric object is returned.
    const metricWithAttribution: INPMetricWithAttribution = Object.assign(
      metric,
      {attribution},
    );
    return metricWithAttribution;
  };

  // Start observing LoAF entries for attribution.
  observe('long-animation-frame', handleLoAFEntries);

  unattributedOnINP((metric: INPMetric) => {
    const metricWithAttribution = attributeINP(metric);
    onReport(metricWithAttribution);
  }, opts);
};
