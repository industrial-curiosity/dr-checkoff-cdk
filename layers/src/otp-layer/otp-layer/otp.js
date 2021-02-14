const aws = require('aws-sdk');
const dynamodb = new aws.DynamoDB.DocumentClient();
const sfet = require('simple-free-encryption-tool');

const OTP_TABLE = process.env.OTP_TABLE_NAME;
const DEFAULT_OTP_TTL_IN_SECONDS = 24*60*60;
const OTP_EXPIRATION_MESSAGE = "Invalid OTP";

// TODO add reinstantiation logic if env variables updated
const mailgun = require('mailgun-js')({
    apiKey: process.env.MAILGUN_API_KEY,
    domain: process.env.MAILGUN_DOMAIN
});

let self = {
    createEntry: ({ userId, purpose, ttl_in_seconds }) => {
        return new Promise((resolve, reject) => {
            let otp = sfet.utils.randomstring.generate(6);
            ttl_in_seconds = ttl_in_seconds || DEFAULT_OTP_TTL_IN_SECONDS;
            dynamodb.put({
                TableName: OTP_TABLE,
                Item: {
                    userId,
                    otp,
                    purpose,
                    "expiration": Math.floor(Date.now() / 1000) + ttl_in_seconds
                }
            }).promise()
            .then(() => { resolve(otp); })
            .catch(reject);
        });
    },
    deleteEntry: ({ userId, otp }) => {
        return new Promise((resolve, reject) => {
            dynamodb.delete({
                TableName: OTP_TABLE,
                Key: {
                    userId,
                    otp
                }
            }).promise()
            .then(resolve)
            .catch(reject);
        });
    },
    getEntry: ({ userId, otp }) => {
        return new Promise((resolve, reject) => {
            // log actual error but return generic error
            let otpRetrievalFailure = (err) => {
                console.error(err);
                reject(new Error(OTP_EXPIRATION_MESSAGE));
            };

            dynamodb.get({
                TableName: OTP_TABLE,
                Key: {
                    userId,
                    otp
                }
            }).promise()
            .then(result => {
                result = result.Item;
                if (!result) {
                    otpRetrievalFailure(new Error("OTP not found"));
                } else {
                    // validate expiration time
                    let currentTime = Math.floor(Date.now() / 1000);
                    if (currentTime > result.expiration) {
                        otpRetrievalFailure(
                            new Error(`OTP expired: ${currentTime} > ${result.expiration}`)
                        );
                    } else {
                        resolve(result);
                    }
                }
            })
            .catch(otpRetrievalFailure);
        });
    },
    send: ({ email, subject, body }) => {
        console.log(`otp sending email '${subject}' to ${email}`);
        return new Promise((resolve, reject) => {
            let message = {
                from: process.env.MAILGUN_FROM,
                to: email,
                subject: subject,
                html: body
            };

            mailgun.messages().send(message, function (err, body) {
                if (err){
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
};

module.exports = self;