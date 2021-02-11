const aws = require('aws-sdk');
const bcrypt = require('bcrypt');
const dynamodb = new aws.DynamoDB.DocumentClient();
const jwt = require('jsonwebtoken');
const ms = require('ms');
const uuid = require('uuid').v4;

const SALT_ROUNDS = 10;
const REFRESH_TOKENS_TABLE = process.env.REFRESH_TOKENS_TABLE_NAME;
const USERS_TABLE = process.env.USERS_TABLE_NAME;

const JWT_EXPIRATION = process.env.JWT_EXPIRATION;
const JWT_REFRESH_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION;

const UNKNOWN_DEVICE_ID = 'unknown';

let self = {
    authenticateToken: ({ requestHeaders }) => {
        return new Promise((resolve, reject) => {
            let authHeader = requestHeaders['Authorization']
            let token = authHeader && authHeader.split(' ')[1]
            if (token == null) {
                return reject(new Error("Authentication token required"));
            }

            jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
                if (err) {
                    console.error(err);
                    return reject(new Error("Invalid/expired authentication token"));
                }
                resolve(user);
            });
        });
    },
    refreshToken: ({ userId, refreshToken, deviceId }) => {
        return new Promise((resolve, reject) => {
            deviceId = deviceId || UNKNOWN_DEVICE_ID;
            let onFoundRefreshToken = (result) => {
                if (result.Item && result.Item.hashedRefreshToken) {
                    bcrypt.compare(refreshToken, result.Item.hashedRefreshToken, function(err, result) {
                        if (!err && result) {
                            loadUser();
                        } else {
                            return reject(new Error("Refresh token invalid"));
                        }
                    });
                } else {
                    console.error(`refresh token ${refreshToken} for user ${userId} not found`);
                    return reject(new Error("Refresh token invalid"));
                }
            };

            let loadUser = () => {
                dynamodb.get({
                    TableName: USERS_TABLE,
                    Key: { userId }
                }).promise()
                .then((result) => {
                    self.generateTokens({ ...result.Item, deviceId })
                    .then(resolve)
                    .catch(reject);
                })
                .catch(err => {
                    console.error(`error looking up user`, err);
                    return reject(new Error("Unable to authenticate user"));
                });
            };

            // look up existing refresh token
            dynamodb.get({
                TableName: REFRESH_TOKENS_TABLE,
                Key: { userId, deviceId }
            }).promise()
            .then(onFoundRefreshToken)
            .catch(err => {
                console.error(`error looking up refresh token`, err);
                return reject(new Error("Refresh token invalid"));
            });
        });
    },
    generateTokens: ({ userId, email, name, projects, deviceId }) => {
        return new Promise((resolve, reject) => {
            deviceId = deviceId || UNKNOWN_DEVICE_ID;
            // JWT_EXPIRATION in zeit/ms
            jwt.sign(
                { userId, email, name, projects, deviceId },
                process.env.JWT_SECRET,
                { expiresIn: JWT_EXPIRATION },
                (err, authToken) => {
                    if (err) {
                        console.error(`error signing tokens`, err);
                        return reject(new Error("Error signing tokens"));
                    }
                    // generate refresh token
                    let refreshToken = uuid();

                    bcrypt.hash(refreshToken, SALT_ROUNDS, function(err, hashedRefreshToken) {
                        if (err) {
                            console.error(`error hashing refresh token ${refreshToken}`, err);
                            // even if an error occurs, the user can continue without a refresh token
                            return resolve({
                                userId,
                                email,
                                name,
                                projects,
                                authToken,
                                authTokenExpiration: JWT_EXPIRATION,
                                refreshToken,
                                refreshTokenExpiration: '0h',
                                deviceId,
                            });
                        }
                        // store bcrypt-hashed refresh token
                        dynamodb.put({
                            TableName: REFRESH_TOKENS_TABLE,
                            Item: {
                                userId,
                                deviceId,
                                hashedRefreshToken,
                                // JWT_REFRESH_EXPIRATION in zeit/ms
                                "expiration": Math.floor(Date.now() / 1000) + ms(JWT_REFRESH_EXPIRATION)
                            }
                        }).promise()
                        .catch(err => {
                            console.error(`failed to store refresh token ${refreshToken} for user ${userId}`, err);
                            // even if an error occurs, the user can continue without a refresh token
                            // so we cascade to then()
                        })
                        .then(() => {
                            resolve({
                                userId,
                                email,
                                name,
                                projects,
                                authToken,
                                authTokenExpiration: JWT_EXPIRATION,
                                refreshToken,
                                refreshTokenExpiration: JWT_REFRESH_EXPIRATION,
                                deviceId,
                            });
                        });
                    });

                }
            );
        });
    },
};

module.exports = self;