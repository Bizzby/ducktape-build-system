'use strict'
/**
 * Crappy failure detectio wrapper
 */

const child_process = require('child_process');

module.exports = function(command, args, opts){

    const friendlyName = `${ command } ${ args.join(' ') }`;

    const result = child_process.spawnSync(command, args, opts)

    // if error then we just log it out and exit, 
    // otherwise retun the result

    if (result.status !== 0) {
        console.log('command "%s" exited with status code %d', friendlyName, result.status)
        console.log('stdout follows:\n', result.stdout.toString() || 'no stdout generated')
        console.log('stderr follows:\n', result.stderr.toString() || 'no stderr generated')
        process.exit(1)
    }

    if (result.error) {
        console.log('command "%s" process failed with error %s', result.error)
        process.exit(1)
    }

    return result

}