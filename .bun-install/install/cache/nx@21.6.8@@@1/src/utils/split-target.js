"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitTarget = splitTarget;
exports.splitByColons = splitByColons;
function findMatchingSegments(s, projectGraph) {
    const projectNames = Object.keys(projectGraph.nodes);
    // return project if matching
    if (projectNames.includes(s)) {
        return [s];
    }
    if (!s.includes(':')) {
        return;
    }
    for (const projectName of projectNames) {
        for (const [targetName, targetConfig] of Object.entries(projectGraph.nodes[projectName].data.targets || {})) {
            if (s === `${projectName}:${targetName}`) {
                return [projectName, targetName];
            }
            if (targetConfig.configurations) {
                for (const configurationName of Object.keys(targetConfig.configurations)) {
                    if (s === `${projectName}:${targetName}:${configurationName}`) {
                        return [projectName, targetName, configurationName];
                    }
                }
            }
        }
    }
}
function splitTarget(s, projectGraph) {
    const matchingSegments = findMatchingSegments(s, projectGraph);
    if (matchingSegments) {
        return matchingSegments;
    }
    if (s.indexOf(':') > 0) {
        let [project, ...segments] = splitByColons(s);
        // if only configuration cannot be matched, try to match project and target
        const configuration = segments[segments.length - 1];
        const rest = s.slice(0, -(configuration.length + 1));
        const matchingSegments = findMatchingSegments(rest, projectGraph);
        if (matchingSegments && matchingSegments.length === 2) {
            return [...matchingSegments, configuration];
        }
        // no project-target pair found, do the naive matching
        const validTargets = projectGraph.nodes[project]
            ? projectGraph.nodes[project].data.targets
            : {};
        const validTargetNames = new Set(Object.keys(validTargets ?? {}));
        return [project, ...groupJointSegments(segments, validTargetNames)];
    }
    // we don't know what to do with the string, return as is
    return [s];
}
function groupJointSegments(segments, validTargetNames) {
    for (let endingSegmentIdx = segments.length; endingSegmentIdx > 0; endingSegmentIdx--) {
        const potentialTargetName = segments.slice(0, endingSegmentIdx).join(':');
        if (validTargetNames.has(potentialTargetName)) {
            const configurationName = endingSegmentIdx < segments.length
                ? segments.slice(endingSegmentIdx).join(':')
                : null;
            return configurationName
                ? [potentialTargetName, configurationName]
                : [potentialTargetName];
        }
    }
    // If we can't find a segment match, keep older behaviour
    return segments;
}
function splitByColons(s) {
    const parts = [];
    let currentPart = '';
    for (let i = 0; i < s.length; ++i) {
        if (s[i] === ':') {
            parts.push(currentPart);
            currentPart = '';
        }
        else if (s[i] === '"') {
            i++;
            for (; i < s.length && s[i] != '"'; ++i) {
                currentPart += s[i];
            }
        }
        else {
            currentPart += s[i];
        }
    }
    parts.push(currentPart);
    return parts;
}
