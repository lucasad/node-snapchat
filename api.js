var crypto = require('crypto'),
     spawn = require('child_process').spawn,
     https = require('https'),
      uuid = require('node-uuid').v1
        fs = require('fs'),
        qs = require('querystring')
	
module.export = {};

var blob_enc_key = Buffer('4d3032636e5135314a69393776775434', 'hex');
    static_token = 'm198sOkJEn37DjqZ32lpRu76xmw288xSQ9',
          secret = 'iEk21fuwZApXlz93750dmW22pw389dPwOk',
         pattern = '0001110111101110001111010101111011010001001110011000110001000110',
            host = 'feelinsonice.appspot.com';

var agent = 'SnapNode 4.0.1 (iPad; iPhone OS 6.0; en_US';

var Client = function(username, password) {
  this.username = username;
  this.password = password;
};

var login = Client.prototype.login = function(cb) {
  var ts = Date.now().toString();
  
  this.call('/ph/login', {
    "username": this.username,
    "password": this.password,
    "timestamp": ts
  }, static_token, ts, function(err, out) {
    if(!err)
      for(key in out)
	this[key] = out[key];
    
    if(typeof cb == 'function')
      cb.call(this, err, out);
  });
};

var sync = Client.prototype.sync = function(cb) {
  var ts = Date.now().toString();
  this.call('/ph/sync', {
    "timestamp": ts,
    "auth_token": this.auth_token
  }, this.auth_token, ts, function(err, out) {
    if(!err)
      for(key in out)
	this[key] = out[key];
      
    if(cb)
      cb.call(this, err, out);
  });
};

var fetch = Client.prototype.fetch = function(id, cb) {
  var ts = Date.now().toString();
  this.call('/ph/blob', {
    "id": id,
    "timestamp": ts,
    "username": this.username,
    "auth_token": this.auth_token
  }, this.auth_token, ts, false, function(err, data) {
    
    var decrypted = crypto.createDecipheriv('aes-128-ecb', blob_enc_key, '');
    decrypted.end(data)    
   
    cb.call(this, decrypted);
  });
};

var call = Client.prototype.call = function(endpoint, object, param1, param2, a, b) {
  var cb;
  var json = true;

  if(typeof b === 'function') {
    json = a;
    cb = b;
  }
  else
    if(typeof a === 'function')
      cb = a;
    else
      json = a;

  var self = this;

  object.req_token = this.hash(param1, param2);
  var post_data = qs.stringify(object);
  
  if(this.debug) {
    this.debug("Calling endpoint '" + endpoint + "'");
    this.debug("POST DATA: " + post_data);
  }
  
  var https_req = https.request({
    "host": host,
    "path": endpoint,
    "method": "POST",
    "headers": {
      "Content-type": "application/x-www-form-urlencoded",
      "Content-length": post_data.length,
      "User-agent": agent
    }
  }, function(res) {
    var body = [];
    var length = 0;
    
    if(json)
      res.setEncoding('binary');
    
    res.on('data', function(chunk) {
      length += chunk.length;
      body.push(chunk);
    });

    res.on('end', function() {
      var data;
      if(length && Buffer.isBuffer(body[0])) {	
	data = new Buffer(length);
	var offset = 0;
	body.forEach(function(chunk) {
	  chunk.copy(data, offset);
	  offset += chunk.length;
	});
	
	return cb.call(self, null, data)
      } else {
	var data = body.join('');
        try {
          var out = JSON.parse(data);
          cb.call(self, null, out);
        } catch (e) {
          cb.call(self, e, data);
        }
	
      }

    });
  });

  https_req.write(post_data);
  https_req.end();
}

var hash = Client.prototype.hash = function(param1, param2) {
  var hash = crypto.createHash('sha256');
  hash.update(secret + param1);
  var hash1 = hash.digest('hex');

  var hash = crypto.createHash('sha256');
  hash.update(param2 + secret);
  var hash2 = hash.digest('hex');

  var len = pattern.length;
  var req_token = Array(len);
  for(var i=0;i<len;i++) {
    req_token[i] = (pattern[i] == '1') ? hash2[i] : hash1[i];
  }

  return req_token.join('');
  
};

module.exports.Client = Client;
