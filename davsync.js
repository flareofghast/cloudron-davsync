#!/usr/bin/env node

var async = require('async'),
    commander = require('commander'),
    ProgressBar = require('progress'),
    webdav = require('webdav');

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

function handleError(message, error) {
    if (error.status === 401) return console.error(message, 'Invalid username or password.');
    console.error(message, error.message);
}

function sync(options) {
    // We require all arguments
    if (!options.source ||
        !options.sourceUsername ||
        !options.sourcePassword ||
        !options.destination ||
        !options.destinationUsername ||
        !options.destinationPassword
    ) return options.help();

    var srcClient = webdav(options.source, options.sourceUsername, options.sourcePassword);
    var dstClient = webdav(options.destination, options.destinationUsername, options.destinationPassword);

    var failedContents = [];
    var invalidContents = [];

    getContents(srcClient, function (error, srcContents) {
        if (error) return handleError('Unable to list items on source server.', error);

        getContents(dstClient, function (error, dstContents) {
            if (error) return handleError('Unable to list items on destination server.', error);

            console.log(`Found ${srcContents.length} items on source server.`);
            console.log(`Found ${dstContents.length} items on destination server.`);

            var bar = new ProgressBar('Syncing :current/:total [:bar] :etas', { head: '>', total: srcContents.length });

            async.eachLimit(srcContents, 10, function (srcContent, callback) {
                getFile(srcClient, srcContent.filename, function (error, srcData) {
                    if (error) return callback(error);

                    putFile(dstClient, srcContent.filename, srcData, function (error, result) {
                        if (error && error.message.indexOf('415') !== -1) invalidContents.push({ content: srcContent, data: srcData.toString() });
                        else if (error) failedContents.push({ content: srcContent, data: srcData.toString(), errorMessage: error.message });

                        bar.tick();

                        callback();
                    });
                });
            }, function (error) {
                if (error) return handleError('Failed to sync.', error);

                if (failedContents.length) {
                    console.error('The following items failed to sync:');
                    failedContents.forEach(function (f) {
                        console.log('===============================');
                        console.log(f.content.filename);
                        console.log(f.data);
                        console.log(f.errorMessage);
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
}

function verify(options) {
    // We require all arguments
    if (!options.source ||
        !options.sourceUsername ||
        !options.sourcePassword
    ) return options.help();

    var client = webdav(options.source, options.sourceUsername, options.sourcePassword);

    getContents(client, function (error, items) {
        if (error) return handleError('Unable to list items on source server.', error);

        console.log(`Found ${items.length} items on source server.`);

        // empty resources are ok
        if(items.length === 0) return console.log('Successfully verified');

        getFile(client, items[0].filename, function (error, data) {
            if (error) return handleError('Unable to get first item on source server.', error);
            console.log('Successfully verified');
        });
    });
}

commander.command('sync')
    .description('Sync DAV resources between servers')
    .option('--source <url>', 'Source - full DAV URL to addressbook or calendar')
    .option('--source-username <username>', 'Source username')
    .option('--source-password <password>', 'Source password')
    .option('--destination <url>', 'Destination - full DAV URL to addressbook or calendar')
    .option('--destination-username <username>', 'Destination username')
    .option('--destination-password <password>', 'Destination password')
    .action(sync);

commander.command('verify')
    .description('Verify DAV source')
    .option('--source <url>', 'Source - full DAV URL to addressbook or calendar')
    .option('--source-username <username>', 'Source username')
    .option('--source-password <password>', 'Source password')
    .action(verify);

// error on unknown commands or no command
commander.on('command:*', function () { commander.help(); });
if (!process.argv.slice(2).length) return commander.help();

commander.parse(process.argv);
