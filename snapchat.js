/**
 *@license
 * Copyright 2013 Lucas A. Dohring
 *
 * Licensed under the EUPL, Version 1.1 or – as soon they
 * will be approved by the European Commission - subsequent
 * versions of the EUPL (the "Licence");
 *
 * You may not use this work except in compliance with the
 * Licence.
 *
 * You may obtain a copy of the Licence at:
 * http://ec.europa.eu/idabc/eupl
 *
 * Unless required by applicable law or agreed to in
 * writing, software distributed under the Licence is
 * distributed on an "AS IS" basis,
 *
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied.
 *
 * See the Licence for the specific language governing
 * permissions and limitations under the Licence.
 */

var FormStream = require('multipart-form-stream'),
crypto = require('crypto'),
https = require('https'),
util = require('util'),
spawn = require("child_process").spawn,
uuid = require("uuid-v4"),
qs = require('querystring'),
Q =  require('q');

var e = module.exports;
/** @const */ var blob_enc_key = e.blob_enc_key = Buffer('4d3032636e5135314a69393776775434', 'hex');
/** @const */ var pattern = e.hash_pattern = "0001110111101110001111010101111011010001001110011000110001000110";
/** @const */ var secret = e.secret = "iEk21fuwZApXlz93750dmW22pw389dPwOk";
/** @const */ var static_token = e.static_token = "m198sOkJEn37DjqZ32lpRu76xmw288xSQ9";
/** @const */ var hostname = e.hostname = "feelinsonice.appspot.com";
/** @const */ var user_agent = e.user_agent = "Snapchat/4.1.07 (Nexus 4; Android 18; gzip)";

var sink = require("stream-sink");

e.hash = function hash(param1, param2) {
    var s1 = secret + param1;
    var s2 = param2 + secret;

    var hash = crypto.createHash('sha256');
    hash.update(s1, 'binary');
    var h1 = hash.digest('hex');

    var hash = crypto.createHash('sha256');
    hash.update(s2, 'binary');
    var h2 = hash.digest('hex');

    var out = '';
    for (var i = 0, len = pattern.length; i < len; ++i) {
        if (pattern[i] == '0') out += h1[i];
        else out += h2[i];
    }
    return out;
};



/** @const */ e.MEDIA_IMAGE = 0;
/** @const */ e.MEDIA_VIDEO = 1;

/**
 * Make a post call and sign it with a req_token.
 * @param  {String}       endpoint  The endpoint to call
 * @param  {Object}       post_data Data
 * @param  {String}       param1    Usually the auth_token
 * @param  {String}       param2    Usually the timestamp
 * @param  {Boolean=false} raw      If true, return a stream instead of a string. The stream will be paused to avoid data loss.
 * @return {Promise}
 */
e.postCall = function postCall(endpoint, post_data, param1, param2, raw, cb) {
    if(typeof raw === 'function') {
        cb = raw;
        raw = false;
    }
    post_data.req_token = e.hash(param1, param2);
    var data = qs.stringify(post_data);
    var opts = {
        host: hostname,
        method: 'POST',
        path: endpoint,
        headers: {
            'User-Agent': e.user_agent,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': data.length
        }
    };
    return Q.promise(function(resolve, reject) {
        var req = https.request(opts, function(res) {
            if(raw) {
                res.pause();
                return resolve(res);
            }
            res.pipe(sink().on('data', function(resp) {
                if(res.statusCode==200)
                    resolve(resp)
                else
                    reject(resp);
            }));
        });
        req.end(data);
    }).nodeify(cb);
};

/**
 * Login and get auth_token
 * @param  {String}  username
 * @param  {String}  password
 * @return {Promise} sync data
 */
e.login = function login(username, password, cb) {
    var ts = '' + Date.now();
    return e.postCall('/ph/login', {
        username: username,
        password: password,
        timestamp: ts
    }, static_token, ts)
	.then(function(data) {
            var resp = JSON.parse(data);
            if(resp.auth_token) return(resp);
            else throw(resp)
	}).nodeify(cb);
};

/**
 * Get current state and optionally update it
 * @param  {String}  username
 * @param  {String}  auth_token 
 * @param  {Object}  json        An object countaining fields to update.
 * @return {Promise} The current state
 */
e.sync = function(username, auth_token, json, cb) {
    var ts = Date.now().toString();
    return e.postCall('/ph/sync', {
        username: username,
        timestamp: ts,
        json: JSON.stringify(json||{}),
        auth_token: auth_token
    }, auth_token, ts)
        .then(function(data) {
            return JSON.parse(data);
        }).nodeify(cb);
};

/**
 * Fetch blob
 * @param  {String}  username
 * @param  {String}  auth_token
 * @param  {String}  id
 * @return {Promise} Readable stream
 */
e.getBlob = function(username, auth_token, id, cb) {
    var ts = Date.now().toString();
    return e.postCall('/ph/blob', {
        id: id,
        timestamp: ts,
        username: username,
    }, auth_token, ts, true)
	.then(function(stream) {
            if(stream.statusCode != 200)
		return Q.promise(function(resolve, reject) {
		    stream.setEncoding('ascii');
		    stream.pipe(sink().on('data', function(resp) {
			reject(resp);
		    }));
		    stream.resume();
		});
            if (stream.headers['content-type'] !== 'application/octet-stream')
                return stream;

            /*var decrypt = crypto.createDecipheriv('aes-128-ecb', blob_enc_key, '');
              stream.on('data', function(data) {
              if(data !== undefined)
              decrypt.update(data);
              }).on('end', function() {
              var final = decrypt.final(); 
              });*/
            var decrypt = spawn('openssl', ['enc', '-d', '-K', '4d3032636e5135314a69393776775434', '-aes-128-ecb']);
            stream.pipe(decrypt.stdin);
            stream.resume();
            return decrypt.stdout;
        }).nodeify(cb);
};

/**
 * Upload a snap
 * @param  {String}  username
 * @param  {String}  auth_token
 * @param  {Stream}  stream A readable stream for the snap.
 * @param  {Boolean} isVideo
 * @return {Promise} The blob's mediaId.
 */
e.upload = function upload(username, auth_token, stream, isVideo, cb) {
    var ts = ''+Date.now();
    isVideo = Number(!!isVideo);

    var mediaId = (username + uuid()).toUpperCase();
    var encrypt = spawn('openssl', ['enc', '-K', '4d3032636e5135314a69393776775434', '-aes-128-ecb']);
    encrypt.stdout.pause();
    stream.pipe(encrypt.stdin);

    var form = new FormStream();
    var req_token = e.hash(auth_token, ts);
    form.addField('req_token', req_token);
    form.addField('timestamp', ts);
    form.addStream('data', 'media', 'application/octet-stream', encrypt.stdout);
    form.addField('username', username);
    form.addField('media_id', mediaId);
    form.addField('type', isVideo);

    return Q.promise(function(resolve,reject) {
        var req = https.request({
            host: hostname,
            method: 'POST',
            path: '/ph/upload',
            headers: {
                'Content-type': 'multipart/form-data; boundary=' + form.getBoundary(),
                'User-Agent': user_agent,
            }
        }, function(res) {
            res.setEncoding('ascii');
            res.pipe(sink().on('data', function(data) {
                if (res.statusCode != 200) return reject(data);
                resolve(mediaId);
            }));
        });
	form.on('data', function(data) {
	    req.write(data);
	}).on('end', function(end) {
	    req.end(end);
	})
    }).nodeify(cb);;
}

/**
 * Send a blob to a friend.
 * @param  {String}  username
 * @param  {String}  auth_token
 * @param  {String}  mediaId    A unique identifyer for the blob generated by @link upload
 * @param  {Array}   friends    An array of friends to send the snap to.
 * @return {Promise}
 */
e.send = function send(username, auth_token, mediaId, friends, time, cb) {
    var ts = Date.now()+'';
    var postData = {
        username: username,
        auth_token: auth_token,
        recipient: friends,
        media_id: mediaId,
        timestamp:ts
    };
    if(typeof time != 'undefined') postData.time = time;
    return e.postCall('/ph/send', postData, auth_token,ts).nodeify(cb);
}

/**
 * Add a friend
 * @param  {String} username
 * @param  {String} auth_token
 * @param  {String} friend      Your soon to be friends
 * @return {Promise}
 */
e.addFriend = function addFriend(username, auth_token, friend) {
    var ts = Date.now().toString();
    return e.postCall('/ph/friend', {
        username: username,
        timestamp: ts,
        action: 'add',
        friend: friend
    }, auth_token, ts)
	.then(function(data) {
            return JSON.parse(data);
	});
};

/**
 * Change a friend's display name
 * @param  {String} username
 * @param  {String} auth_token
 * @param  {String} friend      The friend to modify
 * @param  {String} newName     Their new display name
 * @return {Promise}
 */
e.rename = function rename(username, auth_token, friend, newName, cb) {
    var ts = Date.now().toString();
    return e.postCall('/ph/friend', {
        username: username,
        timestamp: ts,
        action: 'display',
        friend: friend,
        display: newName
    }, auth_token, ts)
	.then(function(data) {
            return JSON.parse(data);
	}).nodeify(cb);
};

/**
 * Remove a friend
 * @param  {String} username
 * @param  {String} auth_token
 * @param  {String} friend      The friend to remove
 * @return {Promise}
 */
e.unfriend = function(username, auth_token, friend, cb) {
    var ts = Date.now().toString();
    return e.postCall('/ph/friend', {
        username: username,
        timestamp: ts,
        action: 'delete',
        friend: friend,
    }, auth_token, ts)
	.then(function(data) {
            return JSON.parse(data);
	}).nodeify(cb);
};

/**
 * Sign up
 * @param  {String}  email
 * @param  {String}  password
 * @param  {String}  username
 * @return {Promise} sync data
 */
e.register = function register(email, password, username, cb) {
    var ts = Date.now().toString();
    return e.postCall('/ph/register', {
        timestamp: ts,
        password: password,
        email: email
    }, static_token, ts)
	.then(function(data) {
            var resp = JSON.parse(JSON.parse(data));
            var token = resp.token;
            if(typeof token === 'undefined')
		throw resp;

            var ts = Date.now().toString();
            return e.postCall('/ph/registeru', {
		timestamp: ts,
		email: email,
		username: username,
            }, static_token, ts)
		.then(function(data) {
		    var resp = JSON.parse(data);
		    if(data.auth_token === 'undefined')
			throw resp;
		    return resp;
		});
	}).nodeify(cb);
};

/**
 * Clear your feed
 * @param  {String} username
 * @param  {String} auth_token
 * @return {Promise}
 */
e.clear = function clear(username, auth_token, cb) {
    var ts = Date.now().toString();
    return e.postCall('/ph/clear', {
        timestamp: ts,
        username: username
    }, auth_token, ts).nodeify(cb);
}

/**
 * Update your email
 * @param  {String} username
 * @param  {String} auth_token
 * @param  {String} email       Your new email.
 * @return {Promise}
 */
e.updateEmail = function updateEmail(username, auth_token, email, cb) {
    var ts = Date.now().toString();
    return e.postCall('/ph/settings', {
        timestamp: ts,
        action: 'updateEmail',
        email: email,
        username: username
    }, auth_token, ts).nodeify(cb);
};

/**
 * Update your privacy settings
 * @param  {String} username
 * @param  {String} auth_token
 * @param  {Boolean} only_friends
 * @return {Promise}
 */
e.privacy = function privacy(username, auth_token, only_friends, cb) {
    only_friends = !!only_friends;
    var ts = Date.now().toString();
    return e.postCall('/ph/settings', {
        timestamp: ts,
        action: 'updatePrivacy',
        privacySetting: +only_friends,
        username: username
    }, auth_token, ts).nodeify(cb);
};

e.Client = require('./client');
