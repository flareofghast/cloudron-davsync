#!/usr/bin/env node

var async = require('async'),
    commander = require('commander'),
    ProgressBar = require('progress'),
    webdav = require('webdav');

commander
    .option('--source <url>', 'Source - full URL to addressbook or calendar')
    .option('--source-username <username>', 'Source username')
    .option('--source-password <password>', 'Source password')
    .option('--destination <url>', 'Destination - full URL to addressbook or calendar')
    .option('--destination-username <username>', 'Destination username')
    .option('--destination-password <password>', 'Destination password')
    .parse(process.argv);

// We require all arguments
if (!commander.source ||
    !commander.sourceUsername ||
    !commander.sourcePassword ||
    !commander.destination ||
    !commander.destinationUsername ||
    !commander.destinationPassword
) commander.help();

function getContents(client, callback) {
    client.getDirectoryContents('/').then(function (result) {
        callback(null, result);
    }).catch(function (error) {
        callback(error);
    });
}

function getFile(client, filename, callback) {
    client.getFileContents(filename).then(function (result) {
        callback(null, result);
    }).catch(function (error) {
        callback(error);
    });
}

function putFile(client, filename, content, callback) {
    client.putFileContents(filename, content).then(function (result) {
        callback(null, result);
    }).catch(function (error) {
        callback(error);
    });
}

var srcClient = webdav(commander.source, commander.sourceUsername, commander.sourcePassword);
var dstClient = webdav(commander.destination, commander.destinationUsername, commander.destinationPassword);

var failedContents = [];
var invalidContents = [];

getContents(srcClient, function (error, srcContents) {
    if (error) return console.error('Unable to list items on source server.', error);

    getContents(dstClient, function (error, dstContents) {
        if (error) return console.error('Unable to list items on destination server.', error);

        console.log(`Found ${srcContents.length} items on source server.`);
        console.log(`Found ${dstContents.length} items on destination server.`);

        var bar = new ProgressBar('Syncing :current/:total [:bar] :etas', { head: '>', total: srcContents.length });

        async.eachLimit(srcContents, 10, function (srcContent, callback) {
            getFile(srcClient, srcContent.filename, function (error, srcData) {
                if (error) return callback(error);

                putFile(dstClient, srcContent.filename, srcData, function (error, result) {
                    if (error && error.message.indexOf('415') !== -1) invalidContents.push({ content: srcContent, data: srcData.toString() });
                    else if (error) failedContents.push({ content: srcContent, data: srcData.toString(), error: error });

                    bar.tick();

                    callback();
                });
            });
        }, function (error) {
            if (error) return console.error('Failed to sync.', error);

            if (failedContents.length) {
                console.error('The following items failed to sync:');
                failedContents.forEach(function (f) {
                    console.log('===============================');
                    console.log(f.content.filename);
                    console.log(f.data);
                    console.log(f.error);
                });
            }

            if (invalidContents.length) {
                console.error('The following items were invalid and not synced:');
                invalidContents.forEach(function (f) {
                    console.log('===============================');
                    console.log(f.content.filename);
                    console.log(f.data);
                });
            }

            console.log(`Done. ${failedContents.length} failed. ${invalidContents.length} invalid.`);

            process.exit((failedContents.length || invalidContents.length) ? 1 : 0);
        });
    });
});
