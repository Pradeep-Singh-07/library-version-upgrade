#!/usr/bin/env node

import axios from "axios";
import semver from "semver";
const options = { method: "GET", timeout: 25000 };

export function removePrefix(version, allVersions) {
  let favourable_versions = allVersions.filter((item) =>
    semver.satisfies(`${item}`, `${version}`)
  );
  const versionRangeRegex = /^>=([\d.]+) <([\d.]+)$/;
  if (
    version.startsWith("*") ||
    version.startsWith("<") ||
    // version.startsWith("^") ||
    version.match(versionRangeRegex)
  )
    return favourable_versions[favourable_versions.length - 1];
  else return favourable_versions[0];
}
let runningCalls = 0;
let maxSimultaneousCalls = 20;
async function waiting() {
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (runningCalls < maxSimultaneousCalls) {
        clearInterval(timer);
        resolve();
      }
    }, 5);
  });
}

export async function getPackageInfo(packageName) {
  return new Promise(async (resolve, reject) => {
    try {
      await waiting();
      runningCalls++;
      const response = await axios.get(
        `https://registry.npmjs.org/${packageName}`,
        options
      );
      runningCalls--;
      let versions_info = response.data.versions;
      let dependencies = [];
      for (let version in versions_info) {
        if (`${versions_info[version]["dependencies"]}` != `${undefined}`) {
          let curr_dependency = [];
          for (let dependency in versions_info[version]["dependencies"]) {
            curr_dependency.push([
              dependency,
              versions_info[version]["dependencies"][dependency],
            ]);
          }
          dependencies.push([`${version}`, curr_dependency]);
        } else {
          dependencies.push([`${version}`, []]);
        }
      }
      resolve(dependencies);
    } catch {
      resolve([]);
    }
  });
}
