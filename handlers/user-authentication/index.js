const bcrypt = require('bcrypt');
const jwt = require('/opt/nodejs/utility-layer/jwt');
const users = require('/opt/nodejs/ddb-layer/users');
const utils = require('/opt/nodejs/utility-layer/utils');

exports.login = async (event) => {
    return new Promise((resolve, reject) => {
        try {
            let payload = utils.processEventBody({
                body: event.body,
                required: [ 'email', 'password' ]
            });

            users.getEntry(payload)
            .then(user => {
                // TODO verify that user status is "active"
                bcrypt.compare(payload.password, user.password, function(err, result) {
                    if (!err && result) {
                        jwt.generateTokens({ ...user, deviceId: payload.deviceId })
                        .then(result => {
                            resolve(utils.createResponse({
                                "statusCode": 200,
                                "body": result
                            }));
                        })
                        .catch(err => {
                            console.error(`error generating jwt tokens for user ${user.userId}`, err);
                            return resolve(utils.formatErrorResponse(
                                500,
                                null,
                                `An unexpected error occurred`
                            ));

                        });
                    } else {
                        return resolve(utils.formatErrorResponse(
                            401,
                            null,
                            `Invalid credentials`
                        ));
                    }
                });
            })
            .catch(err => {
                console.error(`an error occurred while querying user ${payload.userId}${payload.email}`, err);
                return resolve(utils.formatErrorResponse(
                    401,
                    null,
                    `Invalid credentials`
                ));
            });
        } catch (err) {
            console.error(err);
            resolve(utils.formatErrorResponse(
                400,
                err
            ));
        }
    });
};

exports.refreshToken = async (event) => {
    return new Promise((resolve, reject) => {
        let payload;
        try {
            // we receive the userId and the refreshToken in the body
            payload = utils.processEventBody({ body: event.body, required: ['userId', 'refreshToken'] });
        } catch (err) {
            console.error(`error parsing event body`, err, event.body);
            resolve(utils.formatErrorResponse(
                400,
                err,
                `Invalid request format.`
            ));
        }

        jwt.refreshToken(payload)
        .then((session) => {
            resolve(utils.createResponse({
                "statusCode": 200,
                "body": session
            }));
        })
        .catch(err => {
            resolve(utils.formatErrorResponse(
                401,
                err
            ));
        });
    });
};