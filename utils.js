#!/usr/bin/env node

import { getPackageInfo, removePrefix } from "./apiCalls.js";
import { getDependents } from "./dependentsExtraction.js";
import semver from "semver";
import ora from "ora";
import chalk from "chalk";

let tasksCompleted = 0;
let totalTasks = 0;

let spinner = ora(chalk.blue(`generating dependency graph done(${tasksCompleted}/${totalTasks})`));

let dependencyCache = new Map();
let versionCache = new Map();
let apiCache = new Map();
let fillInfoCache = new Map();
let badPackages = new Set();

const JOINER = "$._.$";

export function stringify(array) {
  return array.join(`${JOINER}`);
}

export function destringify(string) {
  return string.split(`${JOINER}`);
}

export function setToatalTasks(x){
    return totalTasks=x;
}

export function getSpinner(){
    return spinner;
}

//returns a promise which resolves with the result of api call
export async function fetchPackageInfo(packageName) {
  if (!apiCache.has(`${packageName}`)) {
    apiCache.set(`${packageName}`, getPackageInfo(packageName));
  }
  return apiCache.get(`${packageName}`);
}

// once we have the response of api call we will set versions and dependencies in our respective caches
export function sortVersions(versions) {
  return versions.sort((a, b) => semver.compare(a, b));
}

//promising to fill package dependencies and versions in caches after extraction
export async function fillPackageCache(packageName, packageInfo) {
  if (!fillInfoCache.has(`${packageName}`)) {
    fillInfoCache.set(
      `${packageName}`,
      new Promise((resolve, reject) => {
        let versions = [];
        packageInfo.forEach(([version, dependencies]) => {
          versions.push(version);
          dependencyCache.set(
            `${stringify([packageName, version])}`,
            dependencies
          );
        });
        versions = sortVersions(versions);
        versionCache.set(`${packageName}`, versions);
        resolve();
      })
    );
  }
  return fillInfoCache.get(`${packageName}`);
}

//fetching data if necessary and then calling to fill caches
export async function extractPackageInfo(packageName) {
  return new Promise(async (resolve, reject) => {
    let packageInfo = await fetchPackageInfo(`${packageName}`);
    if (packageInfo.length) await fillPackageCache(packageName, packageInfo);
    else badPackages.add(`${packageName}`);
    resolve();
  });
}

//if unable to find a package in npm registry mark that as a bad package

//removing prefix
export async function removePrefixes(packageName, packageVersion) {
  return new Promise(async (resolve, reject) => {
    let allVersions = await getPackageVersionsList(packageName);
    if (badPackages.has(`${packageName}`)) {
      resolve("0.0.0");
      return;
    }
    resolve(removePrefix(packageVersion, allVersions));
  });
}

//get all the packages that are present in package.json and depended directly or indirectly on the package
export function getDependentsByYarn(packageName) {
  return getDependents(packageName).map((item) => {
    item = item.split("").reverse().join("");
    let version = item.split(":")[0].split("").reverse().join("");
    item = item.replace("@", `${JOINER}`).split("").reverse().join("");
    let Name = item.split(`${JOINER}`)[0];
    return [Name, version];
  });
}

//get an array of all the versions that falls in the given range
export function allPossibleUpdates(range, allVersions) {
  return allVersions.filter((version) => semver.satisfies(version, range));
}

//returns direct dependencies of a package [[dependency1,dv1],[dependency2,dv2],......]
export async function getDirectDependencies(packageName, packageVersion, flag) {
  let packageVersioneq = await removePrefixes(packageName, packageVersion);
  return new Promise(async (resolve, reject) => {
    if (badPackages.has(`${packageName}`)) {
      resolve([]);
      return;
    }
    let rootPackage = [packageName, packageVersioneq];
    if (`${dependencyCache.get(`${stringify(rootPackage)}`)}` == `undefined`) {
      await extractPackageInfo(packageName);
    }

    if (`${dependencyCache.get(`${stringify(rootPackage)}`)}` == `undefined`) {
      badPackages.add(`${packageName}`);
      resolve([]);
    } else {
      let dependencies = [...dependencyCache.get(`${stringify(rootPackage)}`)];
      if (flag) {
        let range = allPossibleUpdates(packageVersion, [
          ...versionCache.get(`${packageName}`),
        ]);
        range = range.map((item) => [`${packageName}`, item]);
        dependencies.push(...range);
      }
      resolve(dependencies);
    }
  });
}

//removing duplicates from an array
export function removeDuplicates(packages) {
  let temp = new Set();
  packages
    .map((item) => `${stringify(item)}`)
    .forEach((item) => temp.add(`${item}`));

  return [...temp].map((item) => destringify(item));
}

//get all level dependencies [[dependency1,dv1], [dependency2,dv2],......]
export async function getAllDependencies(packageName, packageVersion, flag) {
  return new Promise(async (resolve, reject) => {
    let alldependencies = new Set();
    let newPackages = [[packageName, packageVersion]];
    let iteration = 0;
    while (newPackages.length) {
      newPackages.forEach((item) => {
        alldependencies.add(`${stringify(item)}`);
      });
      let newPackages_temp = [];
      newPackages = newPackages.map((item) =>
        getDirectDependencies(item[0], item[1], flag)
      );
      newPackages = await Promise.all(newPackages);

      newPackages.forEach((items) => newPackages_temp.push(...items));

      newPackages_temp = newPackages_temp.filter(
        (item) => !alldependencies.has(`${stringify(item)}`)
      );
      newPackages = [...newPackages_temp];
      newPackages = removeDuplicates(newPackages);
      iteration;
    }
    resolve([...alldependencies].map((item) => destringify(item)));
  });
}

//get an array of all the versions of package
export async function getPackageVersionsList(packageName) {
  return new Promise(async (resolve, reject) => {
    if (!versionCache.has(`${packageName}`)) {
      await extractPackageInfo(packageName);
    }
    resolve(versionCache.get(`${packageName}`));
  });
}

//to what version we should update rootPackage so that it depends on  dependency with dependencyRequiredVersion
export async function minNecessaryUpdate(rootPackageName, rootPackageVersion, dependencyName, DependencyRequiredVersion, flag) {
  let rootPackageVersions = await getPackageVersionsList(rootPackageName);
  let dependencyVersions = await getPackageVersionsList(dependencyName);
  let rootVersionCount = rootPackageVersions.length;
  let rootindex = rootVersionCount - 1,
    bit = 1 << 20,
    last = "-1";
  rootPackageVersion = await removePrefixes(
    rootPackageName,
    rootPackageVersion
  );

  while (bit > 0) {
    if (bit < 1) bit = 0;
    if (Number(rootindex - bit) >= 0)
      if (
        Number(
          semver.compare(`${rootPackageVersion}`, `${rootPackageVersions[rootindex - bit]}`)
        ) <= 0
      ) {
        let allcurrentdependencies = await getAllDependencies(`${rootPackageName}`, `${rootPackageVersions[rootindex - bit]}`, flag);
        let thisdependency = await Promise.all(
          allcurrentdependencies
            .filter((item) => `${item[0]}` == `${dependencyName}`)
            .map(async (item) => [
              item[0],
              `${await removePrefixes(`${item[0]}`, `${item[1]}`)}`,
            ])
        );

        if (thisdependency.length) {
          let dependencyVersion =
            dependencyVersions[dependencyVersions.length - 1];
          await Promise.all(
            thisdependency.map(
              (item) =>
                new Promise(async (resolve, reject) => {
                  let thisVersion = await removePrefixes(
                    `${dependencyName}`,
                    `${item[1]}`
                  );

                  if (
                    Number(
                      semver.compare(`${dependencyVersion}`, `${thisVersion}`)
                    ) > 0
                  ) {
                    dependencyVersion = thisVersion;
                  }
                  resolve();
                })
            )
          );
          if (
            Number(
              semver.compare(
                `${dependencyVersion}`,
                `${DependencyRequiredVersion}`
              )
            ) >= 0
          ) {
            rootindex -= bit;
            last = dependencyVersion;
          }
        } else {
          last = dependencyVersions[dependencyVersions.length - 1];
          rootindex -= bit;
        }
      }
    bit /= 2;
  }
  tasksCompleted++;
  spinner.text = chalk.blue(
    `generating dependency graph done(${tasksCompleted}/${totalTasks})`
  );
  if (`${tasksCompleted}` == `${totalTasks}`) spinner.succeed();
  return new Promise((resolve, reject) => {
    if (`${last}` != "-1") {
      resolve(`${rootPackageVersions[rootindex]}`);
    } else {
      resolve(`no favourable outcome because of ${rootPackageName}`);
    }
  });
}

// schuduling list update parallely for all the dependents(mainPackages)
export async function listUpdate(flag,mainPackages,dependencyName,DependencyRequiredVersion) {
  return new Promise(async (resolve, reject) => {
    let promiseList = mainPackages.map((item) =>
      minNecessaryUpdate(
        item[0],
        item[1],
        dependencyName,
        DependencyRequiredVersion,
        flag
      )
    );
    Promise.all(promiseList)
      .then((versions) => {
        resolve(versions.map((item, idx) => [mainPackages[idx][0], item]));
      })
      .catch((message) => reject(message));
  });
}