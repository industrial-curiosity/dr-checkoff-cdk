const bcrypt = require('bcrypt');
const users = require('/opt/nodejs/ddb-layer/users');
const utils = require('/opt/nodejs/utility-layer/utils');

const SALT_ROUNDS = 10;

// deliberately ambiguous message to prevent registered user discovery
const AMBIGUOUS_DELIVERY_MESSAGE = "You should receive an OTP shortly if a user with your email address is not already registered.";

const PURPOSE_REGISTRATION = "user registration"

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
                    // TODO generate OTP and send confirmation email
                    resolve(utils.createResponse({
                        "statusCode": 200,
                        "body": {
                            "success": true,
                            "message": "User created successfully, please confirm using the emailed link in order to log in."
                        }
                    }));
                })
                .catch(err => {
                    console.error(`error creating entry for ${JSON.stringify(payload)}`, err);
                    return resolve(utils.formatErrorResponse(
                        500,
                        null,
                        `An unexpected error occurred`
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
