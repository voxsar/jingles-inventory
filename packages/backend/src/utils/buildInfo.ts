import type { RuntimeBuildInfo } from '@jingles/shared';
import { GENERATED_BUILD_INFO } from '../generated/buildInfo';

export function getBackendBuildInfo(): RuntimeBuildInfo {
  return {
    packageName: GENERATED_BUILD_INFO.packageName,
    appVersion: GENERATED_BUILD_INFO.appVersion,
    buildNumber: GENERATED_BUILD_INFO.buildNumber,
    commitHash: GENERATED_BUILD_INFO.commitHash,
    commitShortHash: GENERATED_BUILD_INFO.commitShortHash,
    builtAt: GENERATED_BUILD_INFO.builtAt,
  };
}
