const bcrypt = require('bcrypt');
const otp = require('/opt/nodejs/otp-layer/otp');
const users = require('/opt/nodejs/ddb-layer/users');
const utils = require('/opt/nodejs/utility-layer/utils');

const SALT_ROUNDS = 10;

const PURPOSE_REGISTRATION = "user registration"

function sendOTP({ userId, email, confirmationUrl }) {
    return new Promise((resolve, reject) => {
        otp.createEntry({ userId, purpose: PURPOSE_REGISTRATION })
        .then((value) => {
            confirmationUrl = `${confirmationUrl}?token=${value}`
            otp.send({
                email,
                subject: "Dr Checkoff: Confirm your account registration",
                body: `Please click on the following link to confirm your registration:<br />
<br />
<a href="${confirmationUrl}">${confirmationUrl}</a><br />
<br />
Your account will be inactive until it is confirmed.<br />
<br />
If your link has expired, please register again.<br />
If you did not intend to sign up, then it is safe to simply ignore this message.`
            })
            .then(resolve)
            .catch(reject);
        })
        .catch(reject);
    });
}

exports.register = async (event) => {
    return new Promise((resolve, reject) => {
        try {
            let payload = utils.processEventBody({
                body: event.body,
                required: [ 'email', 'password' ]
            });

            // hash the password
            bcrypt.hash(payload.password, SALT_ROUNDS, function(err, hashedPassword) {
                if (err) {
                    console.error(`error hashing password ${payload.password}`, err);
                    return resolve(utils.formatErrorResponse(
                        500,
                        null,
                        `An unexpected error occurred`
                    ));
                }

                payload.password = hashedPassword;
                payload.projects = [];
                payload.status = "unconfirmed";
                users.createEntry(payload)
                .then(result => {
                    // create and send the confirmation OTP
                    // it's okay if we end up with multiple valid confirmation OTPs
                    sendOTP({
                        userId: result.userId,
                        email: payload.email,
                        confirmationUrl: `${process.env.CLIENT_HOST}/${result.userId}/confirm`
                    })
                    .then(() => {
                        resolve(utils.createResponse({
                            "statusCode": 200,
                            "body": {
                                "success": true,
                                "message": "Registration successful, please confirm using the emailed link in order to activate your account."
                            }
                        }));
                    })
                    .catch((err) => {
                        console.error(err);
                        resolve(utils.formatErrorResponse(
                            500,
                            err,
                            `Registration of ${payload.email} failed.`
                        ));
                    });
                })
                .catch(err => {
                    console.error(`error creating entry for ${JSON.stringify(payload)}`, err);
                    return resolve(utils.formatErrorResponse(
                        500,
                        null,
                        err.message == "Email has already been registered." ?  err.message : `An unexpected error occurred`
                    ));
                });
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

exports.confirm = async (event) => {
    return new Promise((resolve, reject) => {
        let payload = null;
        try {
            payload = utils.processEventBody({ body: event.body, required: ['userId', 'otp'] });
        } catch (err) {
            return resolve(utils.formatErrorResponse(400, err));
        }

        let confirmationFailureErrorHandler = (err) => {
            console.error(err);
            resolve(utils.formatErrorResponse(
                401,
                err,
                `Account confirmation failed, OTP invalid / expired.`
            ));
        };

        otp.getEntry({ userId: payload.userId, otp: payload.otp })
        .then(item => {
            // check otp has the correct purpose
            if (item.purpose != PURPOSE_REGISTRATION) {
                confirmationFailureErrorHandler(`OTP purpose mismatch: ${item.purpose}`);
            } else {
                let deleteOtp = () => {
                    return new Promise((resolve, reject) => {
                        otp.deleteEntry({
                            userId: payload.userId,
                            otp: payload.otp
                        })
                        .then(() => {
                            console.log('OTP deleted successfully');
                            resolve();
                        })
                        .catch(err => {
                            console.error('OTP deletion failed')
                            console.error(err);
                            resolve();
                        })
                    })
                };

                users.getEntry(payload)
                .then(user => {
                    console.log(`users.getEntry`, user);
                    user.status = "active";
                    users.updateEntry(user)
                    .then(({ userId }) => {
                        console.log(`user ${userId} confirmed successfully`);
                        deleteOtp()
                        .then(() => {
                            resolve(utils.createResponse({
                                "statusCode": 200,
                                "body": {
                                    "success": true,
                                    "message": `Account confirmation succeeded.`
                                }
                            }));
                        });
                    })
                    .catch(err => {
                        console.error(`An error occurred confirming user ${payload.userId}`, err);
                        deleteOtp()
                        .then(() => {
                            resolve(utils.formatErrorResponse(
                                500,
                                err,
                                `Account confirmation failed.`
                            ));
                        });
                    });

                })
                .catch(err => {
                    console.error(`an error occurred while querying user ${payload.userId}`, err);
                    return resolve(utils.formatErrorResponse(
                        401,
                        null,
                        `Invalid Account ID`
                    ));
                });
            }
        })
        .catch(confirmationFailureErrorHandler);
    });
}