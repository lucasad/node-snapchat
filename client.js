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

var sc = require('./snapchat');

/**
 * An oop wraper api
 * @constructor
 */

var Client = module.exports = function() {
    if(!(this instanceof Client)) return new Client();
}

/**
 * @param  {String} username
 * @param  {String} password
 * @return {Promise} sync data
 */

Client.prototype.login = function(username, password, cb) {
    var self = this;
    return sc.login(username, password).then(function(data) {
        self.username = data.username;
        self.auth_token = data.auth_token;
        self.lastSync = {
            time: Date.now(),
            data: data
        };
        return data;
    }).nodeify(cb);
};

/**
 * Sign up
 * @param  {String}  email
 * @param  {String}  password
 * @param  {String}  username
 * @return {Promise} sync data
 */
Client.prototype.register = function register(email, password, username, cb) {
    var self = this;
    return sc.register(email, password, username)
	.then(function(syncData) {
            console.log(typeof syncData);
            self.username = username;
            self.auth_token = syncData.auth_token;
            return syncData;
	}).nodeify(cb);
};

/**
 * Removes the auth_token property.
 * AFIK there is no way to invalidate it unless you request a new one.
 */
Client.prototype.logout = function(cb) {
    delete this.auth_token;
    return Q(true).nodeify(cb);
};

/**
 * Sync the data. You need to have an auth_token set first.
 * @return {Promise} The sync data.
 */
Client.prototype.sync = function(jsonOrCb, cb) {
    var self = this;
    var json = {};
    if(typeof jsonOrCb == 'object')
        json = jsonOrCb;
    else(typeof jsonOrCb == 'function')
        cb = jsonOrCb;
    return sc.sync(this.username, this.auth_token, json).then(function(data) {
        self.auth_token = data.auth_token;
        self.lastSync = {
            time: Date.now(),
            data: data
        };
        return data;
    }).nodeify(cb);
}

/**
 * Fetches a blob (image or video)
 * @param  {String}  id The blob id.
 * @return {Promise} A stream (decrypted if necessary)
 */
Client.prototype.getBlob = function(id, cb) {
    if (typeof this.auth_token === "undefined") return Q.reject("Not signed in").nodeify(cb);
    return sc.getBlob(this.username, this.auth_token, id).nodeify(cb);
};

/**
 * Uploads an blob
 * @param  {Stream}  stream  A readable stream to upload
 * @param  {Boolean} isVideo True if the stream is a video.
 * @return {Promise} The blob id
 */
Client.prototype.upload = function(stream, isVideo, cb) {
    return sc.upload(this.username, this.auth_token, stream, isVideo).nodeify(cb);
}

/** Send the snap to people
 * @param  {String}       mediaId the snap to send.
 * @param  {Array|String} friends An array, or comma-seperated list of friends to send the snap to.
 * @param  {Number}       time    How long (in seconds) a snap should be visible. This should only be set if the snap is a picture.
 */
Client.prototype.send = function(mediaId,friends,timeOrCb,cb) {
    var time = 3;
    if(typeof timeOrCb === 'function') {
        cb = timeOrCb;
    }
    return sc.send(this.username,this.auth_token,mediaId,friends,time).nodeify(cb);
};

/**
 * Add a friend
 * @param  {String}  friend Your friend's username
 * @return {Promise}
 */
Client.prototype.addFriend = function(friend, cb) {
    if (typeof this.auth_token === "undefined") return;
    var self = this;
    return sc.addFriend(this.username, this.auth_token, friend).nodeify(cb);
};

/**
 * Set a friend's display name
 * @param  {String} friend  Your friend's username.
 * @param  {String} newName Then new display name.
 * @return {Promise}
 */
Client.prototype.rename = function(friend, newName, cb) {
    if (typeof this.auth_token === "undefined") return;
    var self = this;
    return sc.rename(this.username, this.auth_token, friend, newName).nodeify(cb)
};

/**
 * Unfriend someone
 * @param  {String} friend The friend to remove
 * @return {Promise}
 */
Client.prototype.unfriend = function(friend, cb) {
    if (typeof this.auth_token === "undefined") return;
    return sc.unfriend(this.username, this.auth_token, friend).nodeify(cb);
};

/**
 * Clear your feed
 * @return {Promise}
 */
Client.prototype.clear = function(cb) {
    return sc.clear(this.username, this.auth_token).nodeify(cb);
};

/**
 * Set your privacy settings
 * @param  {Boolean} only_friends If true, only recieve snaps from friends.
 * @return {Promise}
 */
Client.prototype.privacy = function(only_friends, cb) {
    return sc.privacy(this.username, this.auth_token, only_friends).nodeify(cb);
}

/**
 * Update your email
 * @param  {String} email Your new email.
 * @return {Promise}
 */
Client.prototype.updateEmail = function(email, cb) {
    return sc.updateEmail(this.username, this.auth_token, email).nodeify(cb);
};
