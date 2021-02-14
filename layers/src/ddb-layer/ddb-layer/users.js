const aws = require('aws-sdk');
const dynamodb = new aws.DynamoDB.DocumentClient();
const uuid = require('uuid').v4;

const USERS_TABLE = process.env.USERS_TABLE_NAME;
const USER_LOOKUP_TABLE = process.env.USER_LOOKUP_TABLE_NAME;

let self = {
    createEntry: ({ password, email, name, projects, status }) => {
        return new Promise((resolve, reject) => {
            let userId = uuid();
            email = email.toLowerCase();
            // verify that user is not already registered
            self.getEntry({ email })
            .then(user => {
                if (user) {
                    if (user.status == "unconfirmed") {
                        resolve({ userId: user.userId });
                    } else {
                        reject(new Error(`Email has already been registered.`));
                    }
                    // if the user is unconfirmed then return the user record immediately
                } else {
                    // create user entry
                    dynamodb.put({
                        TableName: USERS_TABLE,
                        Item: {
                            userId,
                            password,
                            email,
                            "userName": name, // 'name' is a reserved keyword
                            projects,
                            "accountStatus": status // 'status' is a reserved keyword
                        }
                    }).promise()
                    .then(() => {
                        // create lookup entry
                        dynamodb.put({
                            TableName: USER_LOOKUP_TABLE,
                            Item: {
                                email,
                                userId
                            }
                        }).promise()
                        .then(() => {
                            resolve({ userId });
                        })
                        .catch(reject);
                    })
                    .catch(reject);
                }
            })
            .catch(reject);
        });
    },
    getEntry: ({ userId, email }) => {
        return new Promise((resolve, reject) => {
            let queryById = (userId) => {
                dynamodb.get({
                    TableName: USERS_TABLE,
                    Key: {
                        userId
                    }
                }).promise()
                .then(result => {
                    let user = result.Item;
                    if (user && user.userId) {
                        // translate reserved keywords
                        user.name = user.userName;
                        delete user.userName;
                        user.status = user.accountStatus;
                        delete user.accountStatus;
                    }
                    resolve( user );
                })
                .catch(reject);
            }

            if (userId) {
                queryById(userId);
            } else {
                email = email.toLowerCase();
                // look up user id
                dynamodb.get({
                    TableName: USER_LOOKUP_TABLE,
                    Key: {
                        email
                    }
                }).promise()
                .then(result => {
                    if (result.Item) {
                        queryById(result.Item.userId);
                    } else {
                        // return null as email not found
                        resolve();
                    }
                })
                .catch(reject);
            }
        });
    },
    updateEntry: ({ userId, password, name, projects, status }) => {
        return new Promise((resolve, reject) => {
            // we can't update an undefined field so don't inline this
            let attributes = {
                ":password": password,
                ":projects": projects,
                ":accountStatus": status
            };
            if (name) {
                attributes[":userName"] = name;
            }
            dynamodb.update({
                TableName: USERS_TABLE,
                Key: {
                    userId
                },
                UpdateExpression: `set password = :password, ${ name ? "userName = :userName," : ''} projects = :projects, accountStatus = :accountStatus`,
                ExpressionAttributeValues: attributes
            }).promise()
            .then(result => {
                resolve({ userId });
            })
            .catch(reject);
        });
    }
};

module.exports = self;