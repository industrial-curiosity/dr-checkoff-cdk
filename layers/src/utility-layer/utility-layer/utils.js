const crypto = require('crypto');

const CORS_ORIGIN = process.env.CORS_ORIGIN;

let createResponse = ({ statusCode, body, headers, isBase64Encoded }) => {
    headers = headers || {};
    if (CORS_ORIGIN) {
        // add CORS headers
        headers["Access-Control-Allow-Origin"] = CORS_ORIGIN;
        headers["Access-Control-Allow-Credentials"] = true;
    }
    let result = {
        "isBase64Encoded": (isBase64Encoded == true) || false,
        "statusCode": statusCode || 200,
        "headers": headers,
        "body": JSON.stringify(body || {})
    }
    return result;
};

exports.createResponse = createResponse;

exports.formatErrorResponse = (statusCode, err, reason) => {
    return createResponse({
        "statusCode": statusCode,
        "body": {
            "success": false,
            "reason": reason || (err && err.message) || "an unexpected error occurred",
            "error": err
        }
    });
}

exports.sha256 = {
	hash: (message) => {
		return crypto.createHash('sha256').update(message).digest("hex");
	}
};

exports.xor = (arr) => {
    let on = 0;
    for (let i in arr) {
        if (arr[i]) on++;
    }
    return on == 1;
};

exports.processEventBody = ({ body, required }) => {
    if (!body || body.length == 0) throw new Error("Request body cannot be empty");
    let payload;
    try {
        payload = JSON.parse(body);
    } catch (err) {
        throw new Error("Invalid JSON format");
    }

    // check for required fields
    let vowels = ['a', 'e', 'i', 'o', 'u', 'A', 'E', 'I', 'O', 'U'];
    for (let i in required) {
        let key = required[i];
        if (!payload[key]) {
            let an = vowels.indexOf(key[i].charAt(0)) > -1;
            throw new Error(`Request must include a${an ? 'n' : ''} '${key}' field.`);
        }
    }

    return payload;
}
