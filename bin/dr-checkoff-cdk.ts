#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { DrCheckoffCdkStack } from '../lib/dr-checkoff-cdk-stack';
import stacksJson from '../lib/stacks.json';

const app = new cdk.App();
// this will add an app tag to all components
cdk.Tags.of(app).add("app", "dr-checkoff");

// determine which stacks will be deployed to which regions
// for region-agnostic deployments, set the region to null
type stackType = {
    "corsOrigin": string,
    "region": {
        "region": string,
        "account": string,
    },
    "jwt": {
        "secret": string,
        "authTokenExpiration": string,
        "refreshTokenExpiration": string
    }
}
type stacksType = {
    [key: string]: stackType
}

let stacks:stacksType = stacksJson;

for (let name in stacks) {
    let stack:stackType = stacks[name];
    let regionOptions;
    let stackName = `DrCheckoffCdkStack-${name}`;
    if (!stack.region) {
        // deploy region-agnostic when no region is specified
        regionOptions = undefined;
    } else {
        regionOptions = { env: stack.region };
    }
    let stackInstance = new DrCheckoffCdkStack(
        app, stackName,
        regionOptions,
        stack
    );
    cdk.Tags.of(stackInstance).add('stack-name', stackName);
}
