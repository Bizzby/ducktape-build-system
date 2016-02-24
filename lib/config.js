'use strict'

const fs = require('fs')
const ini = require('ini')
const defaults = require('lodash.defaults')

const defaultConfiguration = {
  git_clone_depth: 10,
  source_tarball_name: 'archive.tar.gz',
  workspace_dirname: 'build',
  repository_dirname: 'source',
  local_slug_name: 'slug.tar.gz',
    // these have to come from external sources
  's3_access_key': null,
  's3_secret_key': null,
  's3_bucket': null,
  'heroku_token': null
}

module.exports = function (configFilepath) {
    // try to load the ini file
  try {
    const configFile = fs.readFileSync(configFilepath, {encoding: 'utf-8'})
    const parsedConfig = ini.parse(configFile)
    return defaults(parsedConfig, defaultConfiguration)
  } catch (error) {
    console.log(`could not load config at ${configFilepath} because ${error}`)
    process.exit(1)
  }
}
