var fs = require('fs');
var path = require('path');
var ini = require('ini');
var defaults = require('lodash.defaults');

var DEFAULT_CONFIG_FILENAME = '.ducktape-cfg'
var DEFAULT_LOCATION = process.cwd();

var defaultConfiguration = {
    git_clone_depth: 10,
    source_tarball_name: 'archive.tar.gz',
    workspace_dirname: 'build',
    local_slug_name: 'slug.tar.gz',
    //these have to come from external sources
    's3_access_key': null,
    's3_secret_key': null,
    's3_bucket': null,
    'heroku_token': null,
}


var parsedConfig = null;
var configFile;

//try to load the ini file
try {
    configFile = fs.readFileSync( path.join(DEFAULT_LOCATION, DEFAULT_CONFIG_FILENAME), {encoding:'utf-8'} )
    parsedConfig = ini.parse(configFile)
} catch (error) {
    console.log('no config file found')
    process.exit(1);
}

var configuration = defaults(parsedConfig, defaultConfiguration)


module.exports = configuration;




