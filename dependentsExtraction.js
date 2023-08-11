#!/usr/bin/env node

import execSync from 'child_process';
export function getDependents(packageName) {
    const command = `node_modules/.bin/yarn why ${packageName} -R --json`;
    let jsonLines = execSync.execSync(command, { encoding: 'utf-8' });
    let parser = jsonLines.split(/\n/).slice(0, -1).map(JSON.parse);
    let output = parser.reduce((acc, line) => ({ ...acc, ...line.children }), {});
    return Object.keys(output);
}
export function printTree(dependency){
    const command = `node_modules/.bin/yarn why ${dependency[0]} -R`;
    console.log(execSync.execSync( command ,{ encoding: 'utf-8' }));
}