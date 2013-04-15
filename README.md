node-snapchat
=============
A NodeJS client for SnapChat

Usage
-----

```js
var fs = require('fs');
var SnapChat = require('node-snapchat');
var client = SnapChat.Client('username', 'password');
client.login(function() {
  console.log(client.snaps);
  client.fetch(client.snaps[0].id, function(stream) {
    stream.pipe(fs.createWriteStream('Most current snap'));
  });
});
```


License
-------
BSD-2 Clause

Credits
-------
Thomas Lackner ([tlack](https://github.com/tlack)) for writing [snaphax](https://github.com/tlack/snaphax.git)
