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
            // create user entry
            dynamodb.put({
                TableName: USERS_TABLE,
                Item: {
                    userId,
                    password,
                    email,
                    name,
                    projects,
                    status
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
                .then(result => { resolve(result.Item); })
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
                    queryById(result.Item.userId);
                })
                .catch(reject);
            }
        });
    },
    updateEntry: ({ userId, password, name, projects, status }) => {
        return new Promise((resolve, reject) => {
            dynamodb.update({
                TableName: USERS_TABLE,
                Key: {
                    userId
                },
                UpdateExpression: "set password = :password, name = :name, projects = :projects, status = :status",
                ExpressionAttributeValues:{
                    ":password": password,
                    ":name": name,
                    ":projects": projects,
                    ":status": status
                }
            }).promise()
            .then(result => { resolve(result.Item); })
            .catch(reject);
        });
    }
};

module.exports = self;