import { LogEntry, LogFilter } from './logTypes';

/**
 * Applies a LogFilter to an array of LogEntry objects.
 * All active filter criteria are AND-combined: an entry must satisfy every
 * criterion that has been specified in the filter to be included in the result.
 */
export function applyFilter(entries: LogEntry[], filter: LogFilter): LogEntry[] {
    return entries.filter((entry) => {
        // Filter by containerIds
        if (filter.containerIds !== undefined && filter.containerIds.length > 0) {
            if (!filter.containerIds.includes(entry.containerId)) {
                return false;
            }
        }

        // Filter by levels
        if (filter.levels !== undefined && filter.levels.length > 0) {
            if (!filter.levels.includes(entry.level)) {
                return false;
            }
        }

        // Filter by streams
        if (filter.streams !== undefined && filter.streams.length > 0) {
            if (!filter.streams.includes(entry.stream)) {
                return false;
            }
        }

        // Filter by timeRange
        if (filter.timeRange !== undefined) {
            const ts = entry.timestamp.getTime();
            if (ts < filter.timeRange.start.getTime() || ts > filter.timeRange.end.getTime()) {
                return false;
            }
        }

        // Filter by searchText (case-insensitive substring match)
        if (filter.searchText !== undefined && filter.searchText.length > 0) {
            if (!entry.message.toLowerCase().includes(filter.searchText.toLowerCase())) {
                return false;
            }
        }

        // Filter by searchRegex
        if (filter.searchRegex !== undefined) {
            if (!filter.searchRegex.test(entry.message)) {
                return false;
            }
        }

        // Filter by excludePatterns (case-insensitive substring exclusion)
        if (filter.excludePatterns !== undefined && filter.excludePatterns.length > 0) {
            const lowerMessage = entry.message.toLowerCase();
            for (const pattern of filter.excludePatterns) {
                if (lowerMessage.includes(pattern.toLowerCase())) {
                    return false;
                }
            }
        }

        return true;
    });
}

/**
 * Manages named filter presets and delegates filtering to the standalone
 * applyFilter function.
 */
export class LogFilterEngine {
    private savedFilters: Map<string, LogFilter> = new Map();

    saveFilter(name: string, filter: LogFilter): void {
        this.savedFilters.set(name, filter);
    }

    loadFilter(name: string): LogFilter | undefined {
        return this.savedFilters.get(name);
    }

    deleteFilter(name: string): void {
        this.savedFilters.delete(name);
    }

    getSavedFilterNames(): string[] {
        return Array.from(this.savedFilters.keys());
    }

    /**
     * Returns a fresh Map of built-in preset filters.
     * Time-based presets are computed at call time so that "Last 5 Minutes"
     * and "Last Hour" always reflect the current moment.
     */
    getPresetFilters(): Map<string, LogFilter> {
        const presets = new Map<string, LogFilter>();

        presets.set('Errors Only', {
            levels: ['error'],
        });

        presets.set('Warnings & Errors', {
            levels: ['warn', 'error'],
        });

        presets.set('Stderr Only', {
            streams: ['stderr'],
        });

        const now = Date.now();

        presets.set('Last 5 Minutes', {
            timeRange: {
                start: new Date(now - 5 * 60 * 1000),
                end: new Date(now),
            },
        });

        presets.set('Last Hour', {
            timeRange: {
                start: new Date(now - 60 * 60 * 1000),
                end: new Date(now),
            },
        });

        return presets;
    }

    applyFilter(entries: LogEntry[], filter: LogFilter): LogEntry[] {
        return applyFilter(entries, filter);
    }
}
