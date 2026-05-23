/*
 * Copyright 2024 Google LLC
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

export class LayoutShiftManager {
  _onAfterProcessingUnexpectedShift?: (entry: LayoutShift) => void;

  _sessionValue = 0;
  _sessionEntries: LayoutShift[] = [];

  _processEntry(entry: LayoutShift) {
    // Only count layout shifts without recent user input.
    if (entry.hadRecentInput) return;

    const firstSessionEntry = this._sessionEntries[0];
    const lastSessionEntry = this._sessionEntries.at(-1);

    // If the entry occurred less than 1 second after the previous entry
    // and less than 5 seconds after the first entry in the session,
    // include the entry in the current session. Otherwise, start a new
    // session.
    if (
      this._sessionValue &&
      firstSessionEntry &&
      lastSessionEntry &&
      entry.startTime - lastSessionEntry.startTime < 1000 &&
      entry.startTime - firstSessionEntry.startTime < 5000
    ) {
      this._sessionValue += entry.value;
      this._sessionEntries.push(entry);
    } else {
      this._sessionValue = entry.value;
      this._sessionEntries = [entry];
    }

    this._onAfterProcessingUnexpectedShift?.(entry);
  }
}
