## dependency-updates-checker


### Table of contents
* [dependency-updates-checker](#dependency-updates-checker)
* [Overview](#overview)
* [Install](#install)
* [Usage](#usage)
* [Limitation](#limitations)
* [References](#references)
* [Author Info](#author-info)

### Overview
The aim of the project is to help with if there is a package in the dependency graph of your project and now if you want to update that then how much updations are needed for the direct dependencies of your project
 ### Install
```
    npm install dependency-updates-checker
```
OR
```
    yarn add dependency-updates-checker
```
---

### Usage
```
    dependency-updates-checker <dependencyName> <requiredVersion> 
```
OR
```
    node_modules/.bin/./dependency-updates-checker <dependencyName> <requiredVersion> 
```
OR 
```
    npx dependency-updates-checker <dependencyName> <requiredVersion> 
```
 This will provide with a list of all the packages (which are the dependencies of your project and are depended directly or indirectly on _dependency_) need to be updated and how much you need to update each of these packages , sometimes if all the versions of a package depends on a lower version of _dependency_ then this will be reported.
 ### Note 
 >Peer dependencies and dev dependencies are ignord here so a lower version of _dependency_ can still be present in the lock file.
 
 >Yarn@3.x should be installed as the yarn -why command is used 

 >Some packages are not present in the npm registry these are not considered while making dependency graph

---

 ### Limitations
 The algorithm here assumes that with an upgrade the versions of the dependency graph changes monotonically, this assumption is wrong very rarely and in this case the output might not be true.
### References
* [npmjs](https://registry.npmjs.org)
* [yarn-why](https://classic.yarnpkg.com/lang/en/docs/cli/why/)
* [semver](https://www.npmjs.com/package/semver)

---

