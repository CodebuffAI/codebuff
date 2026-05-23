import { PropertyMatchType } from '../../types';
export declare function doesDeviceTypeMatch(deviceTypes?: string[], matchType?: PropertyMatchType): boolean;
export declare function hasPeriodPassed(periodDays?: number, lastSeenDate?: string | Date | null): boolean;
