var snapchat = require('../index'),
    client = new snapchat.Client(),
    fs = require('fs');

// Make sure the images folder exists
if(!fs.existsSync('./images')) {
    fs.mkdirSync('./images');
}

client.login('USERNAME', 'PASSWORD');

// Log any errors
client.on('error', function(data) {
    console.log(data);
});

client.on('sync', function(data) {
    // Handle any problems, such as wrong password
    if (typeof data.snaps === 'undefined') {
        console.log(data);
        return;
    }

    // Loop through the latest snaps
    data.snaps.forEach(function(snap) {
        // Make sure the snap item is unopened and sent to you (not sent by you)
        if (typeof snap.sn !== 'undefiend' && typeof snap.t !== 'undefined' && snap.st == 1) {
            console.log('Saving snap from ' + snap.sn + '...');

            // Save the image to ./images/{SENDER USERNAME}_{SNAP ID}.jpg
            var stream = fs.createWriteStream('./images/' + snap.sn + '_' + snap.id + '.jpg', { flags: 'w', encoding: null, mode: 0666 });
            client.getBlob(snap.id, stream);
        }
    });
});