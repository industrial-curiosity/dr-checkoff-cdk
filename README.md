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

## Configuration

Configuration of your stack(s) is performed by updating `lib/stacks.json`.

**WARNING**: we strongly recommend avoiding commits that include your changes
to this file to avoid checking in your secrets.

### Client URL

The `clientUrl` assumes a Dr Checkoff client such as
[Dr Checkoff React Client](https://github.com/industrial-curiosity/dr-checkoff-react),
but it can be any project that provides the route `/{userId}/confirm`, see
[Account Registration](#account-registration).

### JWT

The `jwt.secret` can be any string, but it's advised to run
`node generateJwtSecret.js` and copy in the results.

### Mailgun

This project uses [mailgun](https://mailgun.com) to send one-time registration
confirmation codes via email. If you are not familiar with mailgun, take a look
at [mailgun-web-interface-js](http://htmlpreview.github.io/?https://github.com/therightstuff/mailgun-web-interface-js/blob/master/dist/index.html)
to get started.

### Domain whitelist

`domainWhitelist` is an array of domains from which users can register, or an
empty array to allow registrations from any domain. It is warmly recommended to
keep this list as short as possible as AWS imposes a Lambda Environment
Variable Size Quota of 4KB for ALL environment variables, even if the
theoretical limit for an environment variable is around 32KB.

## Useful commands

- `npm run build`   build layers and compile typescript to js
- `npm run synth`   perform build steps then synthesize the CloudFormation
                    template(s)
- `cdk deploy`      deploy this stack to your default AWS account/region
- `cdk diff`        compare deployed stack with current state

## Account Registration

To register a user, submit a `POST` request to `/register` in the following
format:

```json
{
    "email": "your.email@example.com",
    "password": "your password"
}
```

On successful registration, a `200` response will be returned in the following
format:

```json
{
    "success": true,
    "message": "Registration successful, please confirm using the emailed link in order to activate your account."
}
```

It is possible to register an email address multiple times, but only if it is
unconfirmed.

If the user has not already been registered, an email will be submitted with a
confirmation link composed of the url configured in `lib/stacks.json` and the
route `GET /{userId}/confirm?token={otp}`. The client must translate this into a
`POST` request to `/register/confirm` in the following format:

```json
{
    "userId": "a22e6ae6-03de-4362-aba6-beb31a77be97",
    "otp": "AZJEus"
}
```

On successful confirmation, a `200` response will be returned in the following
format:

```json
{
    "success": true,
    "message": "Account confirmation succeeded."
}
```

## Account Login and Token Refresh

A user can only log in to an active (confirmed) account.

To sign in, submit a `POST` request to `/login` with the following format:

```json
{
    "email": "your.email@example.com",
    "password": "your password",
    "deviceId": "postman"
}
```

The `deviceId` is used to isolate the refresh token per device, if a user logs
in on a different device but the same `deviceId` is used they will be unable to
use their refresh token on the first device.

On successful login, the response will be in the following format:

```json
{
    "userId": "a22e6ae6-03de-4362-aba6-beb31a77be97",
    "email": "your.email@example.com",
    "projects": [],
    "authToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhMjJlNmFlNi0wM2RlLTQzNjItYWJhNi1iZWIzMWE3N2JlOTciLCJlbWFpbCI6ImZpc2hlci5hZGFtLm9ubGluZUBnbWFpbC5jb20iLCJwcm9qZWN0cyI6W10sImRldmljZUlkIjoicG9zdG1hbiIsImlhdCI6MTYxMzMxMjQxNCwiZXhwIjoxNjEzMzE0MjE0fQ.eTEj6hc-edGCaFcdMqknPZaSEf5WSLs06h0z9jonrLo",
    "authTokenExpiration": "30m",
    "refreshToken": "8cdecaf1-405c-4dc9-84f9-2841ca2cdd24",
    "refreshTokenExpiration": "30d",
    "deviceId": "postman"
}
```

To refresh an authentication token, submit a `POST` request to `/login/refresh`
in the following format:

```json
{
    "userId": "a22e6ae6-03de-4362-aba6-beb31a77be97",
    "refreshToken": "8cdecaf1-405c-4dc9-84f9-2841ca2cdd24",
    "deviceId": "postman"
}
```

On successful token refresh, the response will be in the same format as for
login.
