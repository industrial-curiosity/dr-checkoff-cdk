import * as cdk from '@aws-cdk/core';
import { RestApi, LambdaIntegration, Cors } from '@aws-cdk/aws-apigateway';
import { Table, AttributeType, BillingMode } from '@aws-cdk/aws-dynamodb';
import { Function, Runtime, Code, LayerVersion } from '@aws-cdk/aws-lambda';
import { Rule, Schedule } from '@aws-cdk/aws-events';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';

const DDB_ACCESS = {
    READ: 'read',
    WRITE: 'write',
    FULL: 'full'
};

export class DrCheckoffCdkStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps, customOptions?: any) {
        super(scope, id, props);
        const stack = this;
        customOptions = customOptions || {};

        // set default CORS origin to ALL_ORIGINS
        const corsOrigin = customOptions.origin || "*";
        // make the stack's CORS origin available to lambdas as an environment variable
        let corsEnvironment = {
            CORS_ORIGIN: corsOrigin
        };

        // reusable RESTful API CORS options object
        let corsOptions = {
            allowOrigins: [ corsOrigin ], // array containing an origin, or Cors.ALL_ORIGINS
            allowMethods: Cors.ALL_METHODS, // array of methods eg. [ 'OPTIONS', 'GET', 'POST', 'PUT', 'DELETE' ]
        };

        // user row will include
        //  the user id - generated guid (partition key)
        //  password - bcrypt hash of the user's password
        //  email - string
        //  name - string
        //  projects - string array eg. [ 'project-id-1', 'project-id-2', ... ]
        //  status - string
        const usersTable = new Table(stack, 'users', {
            partitionKey: { name: 'userId', type: AttributeType.STRING },
            billingMode: BillingMode.PAY_PER_REQUEST
        });

        // user lookup row will include
        //  email - string (partition key)
        //  the user id - uuid
        const userLookupTable = new Table(stack, 'user-lookup', {
            partitionKey: { name: 'email', type: AttributeType.STRING },
            billingMode: BillingMode.PAY_PER_REQUEST
        });

        // otp row will include
        //  userId - uuid
        //  otp - variable size unambiguous characters
        //  purpose - string
        //  TTL on expiration field
        const otpTable = new Table(stack, 'otp', {
            partitionKey: { name: 'userId', type: AttributeType.STRING },
            sortKey: { name: 'otp', type: AttributeType.STRING },
            billingMode: BillingMode.PAY_PER_REQUEST,
            timeToLiveAttribute: 'expiration'
        });

        // refresh token row will include
        //  userId - uuid
        //  refreshToken - bcrypt hash of the refresh token
        //  TTL on expiration field
        const refreshTokenTable = new Table(stack, 'refresh-tokens', {
            partitionKey: { name: 'userId', type: AttributeType.STRING },
            sortKey: { name: 'deviceId', type: AttributeType.STRING },
            billingMode: BillingMode.PAY_PER_REQUEST,
            timeToLiveAttribute: 'expiration'
        });

        // utility layer
        const utilityLayer = new LayerVersion(stack, 'utility-layer', {
            // Code.fromAsset must reference the build folder
            code: Code.fromAsset('./layers/build/utility-layer'),
            compatibleRuntimes: [Runtime.NODEJS_12_X],
            license: 'MIT',
            description: 'a layer for providing utility functions',
        });

        // ddb layer
        const ddbLayer = new LayerVersion(stack, 'ddb-layer', {
            // Code.fromAsset must reference the build folder
            code: Code.fromAsset('./layers/build/ddb-layer'),
            compatibleRuntimes: [Runtime.NODEJS_12_X],
            license: 'MIT',
            description: 'a layer for providing dynamodb table interfaces',
        });

        let authenticationEnvironment = {
            USERS_TABLE_NAME: usersTable.tableName,
            USER_LOOKUP_TABLE_NAME: userLookupTable.tableName,
            REFRESH_TOKENS_TABLE_NAME: refreshTokenTable.tableName,
        };

        let jwtEnvironment = {
            JWT_SECRET: customOptions.jwt.secret,
            JWT_EXPIRATION: customOptions.jwt.authTokenExpiration,
            JWT_REFRESH_EXPIRATION: customOptions.jwt.refreshTokenExpiration,
        }

        const restApi = new RestApi(stack, `dr-checkoff-cdk-api`, {
            defaultCorsPreflightOptions: {
                allowOrigins: [ corsOrigin ],
                allowMethods: Cors.ALL_METHODS,
            }
        });

        // set up api resources
        const api: any = {
            'root': restApi.root
        };

        // /register
        api.register = api.root.addResource('register');

        let registrationFunctions = [
            {
                name: 'user-registration',
                handler: 'index.register',
                code: './handlers/user-registration',
                method: 'POST',
                resource: api.register,
                environment: {
                ...corsEnvironment,
                ...authenticationEnvironment
                },
                ddbAccess: [
                    { table: usersTable, access: DDB_ACCESS.WRITE },
                    { table: userLookupTable, access: DDB_ACCESS.WRITE }
                ],
                layers: [ddbLayer, utilityLayer],
            },
        ];

        for (let rfi in registrationFunctions) {
            createIntegratedFunction(stack, registrationFunctions[rfi]);
        }

        // /login
        api.login = api.root.addResource('login');
        api.loginRefreshToken = api.login.addResource('refresh');

        let loginFunctions = [
            {
                name: 'user-login',
                handler: 'index.login',
                code: './handlers/user-authentication',
                method: 'POST',
                resource: api.login,
                environment: {
                    ...corsEnvironment,
                    ...authenticationEnvironment,
                    ...jwtEnvironment,
                },
                ddbAccess: [
                    { table: usersTable, access: DDB_ACCESS.READ },
                    { table: userLookupTable, access: DDB_ACCESS.READ },
                    { table: refreshTokenTable, access: DDB_ACCESS.WRITE }
                ],
                layers: [ddbLayer, utilityLayer],
            },
            {
                name: 'user-refresh-token',
                handler: 'index.refreshToken',
                code: './handlers/user-authentication',
                method: 'POST',
                resource: api.loginRefreshToken,
                environment: {
                    ...corsEnvironment,
                    ...authenticationEnvironment,
                    ...jwtEnvironment,
                },
                ddbAccess: [
                    { table: usersTable, access: DDB_ACCESS.READ },
                    { table: userLookupTable, access: DDB_ACCESS.READ },
                    { table: refreshTokenTable, access: DDB_ACCESS.FULL }
                ],
                layers: [ddbLayer, utilityLayer],
            },
        ];

        for (let lfi in loginFunctions) {
            createIntegratedFunction(stack, loginFunctions[lfi]);
        }
    }
}

type ddbAccessConfiguration = {
    table: Table,
    access: string
}

function createIntegratedFunction(stack: DrCheckoffCdkStack, definition: any) {
    console.log(`creating lambda ${definition.name}...`);
    let lambda = new Function(stack, `${definition.name}-function`, {
        runtime: Runtime.NODEJS_12_X,
        handler: definition.handler,
        code: Code.fromAsset(definition.code),
        environment: definition.environment,
        layers: definition.layers,
        timeout: definition.timeout || cdk.Duration.seconds(5)
    });

    if (!definition.methods && definition.method) {
        definition.methods = [ definition.method ];
    }

    if (!definition.resources && definition.resource) {
        definition.resources = [ definition.resource ];
    }

    let lambdaIntegration = new LambdaIntegration(lambda);
    for (let ri in definition.resources) {
        let resource = definition.resources[ri];
        for (let mi in definition.methods) {
            let method = definition.methods[mi];
            console.log(`adding method ${method} to resource ${resource}...`);
            resource.addMethod(method, lambdaIntegration);
        }
    }

    let ddbAccessConfigurations: ddbAccessConfiguration[] = definition.ddbAccess || [];
    for (let dai in ddbAccessConfigurations) {
        let ddbAccessConfiguration = ddbAccessConfigurations[dai];
        console.log(`granting ${definition.name} ${ddbAccessConfiguration.access} access on ${ddbAccessConfiguration.table.tableName}...`)
        switch (ddbAccessConfiguration.access) {
            case DDB_ACCESS.FULL:
                ddbAccessConfiguration.table.grantFullAccess(lambda);
                break;
            case DDB_ACCESS.READ:
                ddbAccessConfiguration.table.grantReadData(lambda);
                break;
            case DDB_ACCESS.WRITE:
                ddbAccessConfiguration.table.grantWriteData(lambda);
                break;
        }
    }

    let queueAccess = definition.queueAccess || [];
    for (let qai in queueAccess) {
        definition.queueAccess[qai].grantSendMessages(lambda);
    }

    let eventSources = definition.eventSources || [];
    for (let esi in eventSources) {
        lambda.addEventSource(eventSources[esi]);
    }

    if (definition.cron) {
        let rule = new Rule(stack, `${definition.name}-rule`, {
            schedule: definition.cron
        });

        rule.addTarget(new LambdaFunction(lambda));
    }
}
