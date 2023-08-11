#!/usr/bin/env node

import { getPackageInfo, removePrefix } from "./apiCalls.js";
import { getDependents, printTree } from "./dependentsExtraction.js";
import semver from "semver";
import ora from "ora";
import chalk from "chalk";
import { execSync } from "child_process";

let tasksCompleted = 0;
let totalTasks = 0;

let spinner = ora(
  chalk.blue(
    `generating dependency graph done(${tasksCompleted}/${totalTasks})`
  )
);

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

export function printDependents(dependents) {
  console.log(
    `found`,
    chalk.greenBright(`${dependents.length}`),
    `dependent(s):`
  );
  dependents.forEach((item) => {
    console.log(chalk.magenta(`${item[0]}`));
  });
}

export function makeSet(dependents) {
  let currentVersions = new Set();
  dependents.forEach((item) => {
    currentVersions.add(`${stringify(item)}`);
  });
  return currentVersions;
}

export function printResult(dependency, result, currentVersions) {
  return new Promise((resolve, reject) => {
    Promise.all(
      result.map(async (rootPackage) => {
        return new Promise(async (resolve, reject) => {
          if (rootPackage[1].startsWith("no")) {
            chalk.red(console.log(rootPackage[1]));
            // await printReason(`${rootPackage[0]}` ,dependency)
          } else if (!currentVersions.has(`${stringify(rootPackage)}`))
            console.log(
              chalk.yellow(`update ${rootPackage[0]} to ${rootPackage[1]}`)
            );
          else
            console.log(
              chalk.green(chalk.cyanBright(`${rootPackage[0]} up to date`))
            );
          resolve();
        });
      })
    ).then(() => resolve());
  });
}

export function setToatalTasks(num) {
  return (totalTasks = num);
}

export function startSpinner(dependents) {
  spinner.text = chalk.blue(
    `generating dependency graph done(0/${dependents.length})`
  );
  spinner.start();
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

function generateFillCachePromise(packageInfo, packageName) {
  return new Promise((resolve, reject) => {
    let versions = [];
    packageInfo.forEach(([version, dependencies]) => {
      versions.push(version);
      dependencyCache.set(`${stringify([packageName, version])}`, dependencies);
    });
    versions = sortVersions(versions);
    versionCache.set(`${packageName}`, versions);
    resolve();
  });
}

//promising to fill package dependencies and versions in caches after extraction
export async function fillPackageCache(packageName, packageInfo) {
  if (!fillInfoCache.has(`${packageName}`)) {
    fillInfoCache.set(
      `${packageName}`,
      generateFillCachePromise(packageInfo, packageName)
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
    //if(`${packageVersion}` == `undefined`)console.log(chalk.red(packageName));
    resolve(removePrefix(packageVersion, allVersions));
  });
}

function filterDependents(packageString) {
  const workspacePattern = /^([^@]+)@workspace:(.*)$/;
  if (
    packageString.match(workspacePattern) ||
    packageString.startsWith("@sprinklr") ||
    packageString.startsWith("spr-") ||
    packageString.startsWith("@lyearn")
  ) {
    return false;
  }
  return true;
}

//get all the packages that are present in package.json and depended directly or indirectly on the package
export function getDependentsByYarn(packageName) {
  let dependents = getDependents(packageName)
    .filter(filterDependents)
    .map((item) => {
      item = item.split("").reverse().join("");
      let version = item.split(":")[0].split("").reverse().join("");
      item = item.replace("@", `${JOINER}`).split("").reverse().join("");
      let Name = item.split(`${JOINER}`)[0];
      return [Name, version];
    });
  printDependents(dependents);
  setToatalTasks(dependents.length);
  if (dependents.length) startSpinner(dependents);
  return dependents;
}

//get an array of all the versions that falls in the given range
export function allPossibleUpdates(range, allVersions) {
  return allVersions.filter((version) => semver.satisfies(version, range));
}

//returns direct dependencies of a package [[dependency1,dv1],[dependency2,dv2],......]
export async function getDirectDependencies(packageName, packageVersion) {
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
export async function getAllDependencies(packageName, packageVersion) {
  return new Promise(async (resolve, reject) => {
    let allDependencies = new Set();
    let newPackages = [[packageName, packageVersion]];
    let iteration = 0;
    while (newPackages.length) {
      newPackages.forEach((item) => {
        allDependencies.add(`${stringify(item)}`);
      });
      let newPackagesTemp = [];
      newPackages = newPackages.map((item) =>
        getDirectDependencies(item[0], item[1])
      );
      newPackages = await Promise.all(newPackages);
      newPackages.forEach((items) => newPackagesTemp.push(...items));
      newPackagesTemp = newPackagesTemp.filter(
        (item) => !allDependencies.has(`${stringify(item)}`)
      );
      newPackages = [...newPackagesTemp];
      newPackages = removeDuplicates(newPackages);
      iteration;
    }
    resolve([...allDependencies].map((item) => destringify(item)));
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
export async function minNecessaryUpdate(
  rootPackageName,
  rootPackageVersion,
  dependencyName,
  DependencyRequiredVersion
) {
  let rootPackageVersions = await getPackageVersionsList(rootPackageName);
  let dependencyVersions = await getPackageVersionsList(dependencyName);
  if (!rootPackageVersions?.length) {
    return new Promise((resolve, reject) => {
      tasksCompleted++;
      resolve(`no versions found for ${rootPackageName}`);
    });
  }
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
          semver.compare(
            `${rootPackageVersion}`,
            `${rootPackageVersions[rootindex - bit]}`
          )
        ) <= 0
      ) {
        let allcurrentdependencies = await getAllDependencies(
          `${rootPackageName}`,
          `${rootPackageVersions[rootindex - bit]}`
        );
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
      resolve(`no possible update for ${rootPackageName}`);
    }
  });
}

// schuduling list update parallely for all the dependents(mainPackages)
export async function listUpdate(
  mainPackages,
  dependencyName,
  DependencyRequiredVersion
) {
  return new Promise(async (resolve, reject) => {
    let promiseList = mainPackages.map((mainPackage) =>
      minNecessaryUpdate(
        mainPackage[0], //packageName
        mainPackage[1], //packageVersion
        dependencyName,
        DependencyRequiredVersion
      )
    );
    Promise.all(promiseList)
      .then((versions) => {
        resolve(versions.map((item, idx) => [mainPackages[idx][0], item]));
      })
      .catch((message) => reject(message));
  });
}

export async function getLatest(packageName) {
  let versions = await getPackageVersionsList(packageName);
  return versions[versions.length - 1];
}

// takes array of packages [[p1,v1],[p2,v2]..] and replaces vesions with latest[[p1,v*],[p2,v*]]
export function extractLatest(dependencies) {
  return Promise.all(
    dependencies.map(async (dependency) => [
      dependency[0],
      await getLatest(dependency[0]),
    ])
  );
}

export async function isUpdatePossibe(dependency, rootPackage) {
  return new Promise(async (resolve, reject) => {
    let versions = await getAllDependencies(rootPackage[0], rootPackage[1]);
    versions = versions
      .filter(
        ([packageName, packageVersion]) =>
          `${packageName}` === `${dependency[0]}`
      )
      .map(([packageName, packageVersion]) =>
        removePrefixes(dependency[0], packageVersion)
      );
    versions = await Promise.all(versions);

    if (versions.length) {
      versions = sortVersions(versions);
      if (Number(semver.compare(`${versions[0]}`, `${dependency[1]}`)) < 0)
        resolve(false);
    }
    resolve(true);
  });
}

export async function printReason(rootPackage, dependency) {
  return new Promise(async (resolve, reject) => {
    let rootPackageVersion = await getLatest(rootPackage);

    let allDependencies = await getAllDependencies(
      rootPackage,
      rootPackageVersion
    );
    allDependencies = await extractLatest(allDependencies);
    let possible = await Promise.all(
      allDependencies.map(async (rootPackage) =>
        isUpdatePossibe(dependency, rootPackage)
      )
    );
    allDependencies = allDependencies
      .filter((dependency, index) => !possible[index])
      .map((item) => [item[0]]);
    removeDuplicates(allDependencies);
    console.log(
      `The latest versions of following dependencies of`,
      chalk.greenBright(`${rootPackage}`),
      `depends on lower version of`,
      chalk.greenBright(`${dependency[0]} `)
    );
    allDependencies.forEach((dependency) => {
      if (`${dependency[0]}` != `${rootPackage}`) {
        console.log(chalk.red(dependency[0]));
        printTree(dependency);
      }
    });
    resolve();
  });
}
