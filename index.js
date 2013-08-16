var crypto = require('crypto'),
    https = require('https'),
    util = require('util'),
    spawn = require("child_process").spawn,
    form = require('multipart-form-stream'),
    uuid = require("uuid-v4"),
    qs = require('querystring');

var blob_enc_key = Buffer('4d3032636e5135314a69393776775434', 'hex'),
    pattern = "0001110111101110001111010101111011010001001110011000110001000110",
    secret = "iEk21fuwZApXlz93750dmW22pw389dPwOk",
    static_token = "m198sOkJEn37DjqZ32lpRu76xmw288xSQ9",
    hostname = "feelinsonice.appspot.com",
    user_agent = "Snaphax 4.0.1 (iPad; iPhone OS 6.0; en_US)";

var sink = require("stream-sink");

var hash = function(param1, param2) {
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



var EventEmitter = require('events').EventEmitter;
var Client = function() {
    EventEmitter.call(this);
    this.MEDIA_IMAGE = 0;
    this.MEDIA_VIDEO = 1;
};
util.inherits(Client, EventEmitter);

Client.prototype.postCall = function(endpoint, post_data, param1, param2, callback) {
    post_data.req_token = hash(param1, param2);
    var data = qs.stringify(post_data);

    var opts = {
        host: hostname,
        method: 'POST',
        path: endpoint,
        headers: {
            'User-Agent': user_agent,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': data.length
        }
    };

    var req = https.request(opts, function(res) {
        callback(res);
    });
    req.write(data);
    req.end();
};

var syncClient = function(client) {
    client.sync();
};
Client.prototype.refRate = 30000;

Client.prototype.login = function(username, password) {
    var ts = '' + Date.now();
    var self = this;
    this.postCall('/ph/login', {
        username: username,
        password: password,
        timestamp: ts
    }, static_token, ts, function(stream) {
        stream.setEncoding('binary');
        if (stream.statusCode != 200) {
            stream.pipe(sink().on('data', function(data) {
                self.emit('error', data);
            }));
            return;
        }
        stream.pipe(sink().on('data', function(data) {
            data = JSON.parse(data);
            self.auth_token = data.auth_token;
            self.lastSync = {
                time: Date.now(),
                data: data
            };
            self.emit('sync', data);
            if (self.refRate) self._timer = setTimeout(syncClient, self.refRate, self);
            self.username = data.username;
        }));
    });
    this.username = username;
};

Client.prototype.logout = function() {
    delete this.auth_token;
    clearTimeout(this._timer);
};

Client.prototype.sync = function() {
    if (typeof this.auth_token === "undefined") return;
    var self = this;

    var ts = (this.lastSync = Date.now()).toString();
    this.postCall('/ph/sync', {
        username: this.username,
        timestamp: ts,
        json: '{}',
        auth_token: this.auth_token
    }, this.auth_token, ts, function(stream) {
        stream.setEncoding('binary');
        if (stream.statusCode != 200) {
            stream.pipe(sink().on('data', function(data) {
                self.emit('error', data);
            }));
            return;
        }
        stream.pipe(sink().on('data', function(data) {
            data = JSON.parse(data);
            self.auth_token = data.auth_token;
            self.lastSync = {
                time: Date.now(),
                data: data
            };
            self.emit('sync', data);

            if (self.refRate && (self.lastSync + self.refRate > Date.now())) {
                self._timer = setTimeout(syncClient, self.refRate, self);
            }
        }));
    });
};

Client.prototype.getBlob = function(id, out, cb) {
    if (typeof this.auth_token === "undefined") return cb("Not signed in");

    var ts = Date.now().toString();
    this.postCall('/ph/blob', {
        id: id,
        timestamp: ts,
        username: this.username
    }, this.auth_token, ts, function(stream) {
        if (out.setHeader) out.setHeader('Content-type', stream.headers['content-type']);

        if (stream.headers['content-type'] == 'application/octet-stream') {
            /*var decrypt = crypto.createDecipheriv('aes-128-ecb', blob_enc_key, '');
            stream.on('data', function(data) {
                if(data !== undefined)
                    decrypt.update(data);
            }).on('end', function() {
               var final = decrypt.final(); 
            });*/
            var decrypt = spawn('openssl', ['enc', '-d', '-K', '4d3032636e5135314a69393776775434', '-aes-128-ecb']);
            stream.pipe(decrypt.stdin);
            decrypt.stdout.pipe(out);
            return;
        }
        stream.pipe(out);
    });
};

Client.prototype.upload = function(stream, friends, opts) {
    opts = opts || {};

    var self = this;
    var isVideo = Number( !! opts.isVideo);
    if (isVideo) if (opts.time) delete opts.time;
    else opts.time = opts.time || 3;

    var mediaId = (this.username + uuid()).toUpperCase();
    var ts = Date.now().toString();
    var encrypt = spawn('openssl', ['enc', '-K', '4d3032636e5135314a69393776775434', '-aes-128-ecb']);
    stream.pipe(encrypt.stdin);
    var formStream = new form();
    var req_token = hash(this.auth_token, ts);
    formStream.addField('req_token', req_token);
    formStream.addField('timestamp', ts);
    formStream.addStream('data', 'media', 'application/octet-stream', encrypt.stdout);
    formStream.addField('username', this.username);
    formStream.addField('media_id', mediaId);
    formStream.addField('type', isVideo);


    formStream.pipe(https.request({
        host: hostname,
        method: 'POST',
        path: '/ph/upload',
        headers: {
            'Content-type': 'multipart/form-data; boundary=' + formStream.getBoundary(),
            'User-Agent': user_agent,
        }
    }, function(res) {
        res.setEncoding('ascii');
        res.pipe(sink().on('data', function(data) {
            console.log(data);
            if (res.statusCode != 200) return self.emit('error', data);

            if(Array.isArray(friends))
                friends = friends.map(encodeURIComponent).join(',');
            var ts = Date.now().toString();
            var postData = {
                username: self.username,
                timestamp: ts,
                recipient: friends,
                media_id: mediaId,
            };
            if (opts.time) postData.time = opts.time;
            self.postCall('/ph/send', postData, self.auth_token, ts, function(out) {
                out.pipe(sink().on('data', function(data) {
                    if (res.statusCode != 200) return self.emit('error', data);
                }));
            });
        }));
    }));
};

Client.prototype.addFriend = function(friend) {
    if (typeof this.auth_token === "undefined") return;
    var self = this;
    var ts = Date.now().toString();
    this.postCall('/ph/friend', {
        username: this.username,
        timestamp: ts,
        action: 'add',
        friend: friend
    }, this.auth_token, ts, function(stream) {
        stream.setEncoding('ascii');
        stream.pipe(sink().on('data', function(resp) {
            var data = JSON.parse(resp);
            self.emit('info', data);
            self.sync();
        }));
    });
};

Client.prototype.rename = function(friend, newName) {
    if (typeof this.auth_token === "undefined") return;
    var self = this;
    var ts = Date.now().toString();
    this.postCall('/ph/friend', {
        username: this.username,
        timestamp: ts,
        action: 'display',
        friend: friend,
        display: newName
    }, this.auth_token, ts, function(stream) {
        stream.setEncoding('ascii');
        stream.pipe(sink().on('data', function(resp) {
            var data = JSON.parse(resp);
            self.emit('info', data);
            self.sync();
        }));
    });
};

Client.prototype.unfriend = function(friend) {
    if (typeof this.auth_token === "undefined") return;
    var self = this;
    var ts = Date.now().toString();
    this.postCall('/ph/friend', {
        username: this.username,
        timestamp: ts,
        action: 'delete',
        friend: friend,
    }, this.auth_token, ts, function(stream) {
        stream.setEncoding('ascii');
        stream.pipe(sink().on('data', function(resp) {
            var data = JSON.parse(resp);
            self.emit('info', data);
            self.sync();
        }));
    });
};

module.exports.Client = Client;
