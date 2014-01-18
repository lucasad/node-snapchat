#!/usr/bin/env node
var Q = require('q')
,  sc = require('../snapchat')
,  fs = require('fs')
,util = require('util');

(function main(argc, argv) {
    // Usage: ./upload <username> <password> <timeout|0 if video> <snap> <recipient 1> [recipient2] ... [recipient n]
    if(argc < 6) {
        var path = require('path');
        var name = path.basename(argv.shift());
        util.puts(util.format("Usage:"))
        util.puts(util.format("\t%s username password timeout filename.jpg first_recipient [more_recipents]", name));
        util.puts(util.format("\t%s username password 0       filename.mp4 first_recipient [more_recipients]", name));
        return false;
    }
    argv.shift();

    var username = argv.shift()
    ,   password = argv.shift()
    ,   time  = argv.shift()
    ,   filename = argv.shift()
    ,   recipients = argv;


    var isVideo = time === 0;

    var c = new sc.Client();
    c.login(username, password)
        .then(function() {
            var blob = fs.createReadStream(filename);
            return c.upload(blob, isVideo);
        }, function(err) {
            console.error("Failed to login");
            console.error(err)
        })
        .then(function(mediaId) {
            return Q.allSettled(recipients.map(function(recipient) {
                if(isVideo)
                    return c.send(mediaId, recipient).catch(function(err) {
                        console.error("Failed to send snap to", recipient);
                        console.error(err);
                    });
                else
                    return c.send(mediaId, recipient, time).catch(function(err) {
                        console.error("Failed to send snap to", recipient);
                        console.error(err);
                    });
            }));
        }, function(error) {
            console.error("Unable to upload file", filename);
            console.error(error);
        })
        .then(function(statuses) {
            console.log("All done");
        }, function(err) {
            console.error("There was an error")
            console.error(err);
        });
})(process.argv.length-1, process.argv.slice(1))

