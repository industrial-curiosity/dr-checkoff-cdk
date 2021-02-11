# Dr Checkoff CDK

A TypeScript CDK project for Dr Checkoff cloud solution, bootstrapped with the
[aws-cdk-js-dev-guide](https://github.com/therightstuff/aws-cdk-js-dev-guide).

## Installation

First, clone this repository:

```bash
git clone git@github.com:industrial-curiosity/dr-checkoff-cdk.git
```

Then install AWS CDK and the project dependencies

```bash
npm install -g cdk
npm install
```

NOTE: `bcrypt` must be built for the AWS targets, which means that it must be
built on linux. As such, the `linux-builds` folder would benefit from periodic
updates.


## Useful commands

- `npm run build`   build layers and compile typescript to js
- `npm run synth`   perform build steps then synthesize the CloudFormation
                    template(s)
- `cdk deploy`      deploy this stack to your default AWS account/region
- `cdk diff`        compare deployed stack with current state
