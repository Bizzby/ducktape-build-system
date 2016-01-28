'use strict'
/**
 * Args: repo, commit, heroku-app
 */

const fs = require('fs');
const path = require('path');
const async = require('async');
const rimraf = require('rimraf');
const Heroku = require('heroku-client');
const request = require('request');
const AWS = require('aws-sdk');
const argv = require('yargs').argv 

const config = require('./lib/config')
const spawnSync = require('./lib/procSpawn')

/**
 * START: Things to move out to configuration
 */
const WORKSPACE_DIR = path.join( process.cwd(), config.workspace_dirname);
const SOURCE_DIR = path.join(WORKSPACE_DIR, config.repository_dirname)
const HEROKU_TOKEN = config.heroku_token;
const DEST_S3_CONF = {
  accessKeyId: config.s3_access_key,
  secretAccessKey: config.s3_secret_key 
}
const DEST_S3_BUCKETNAME = config.s3_bucket

const DEFAULT_GIT_CLONE_DEPTH = config.git_clone_depth
const DEFAULT_SOURCE_TARBALL_NAME = config.source_tarball_name
const DEFAULT_TEMP_LOCAL_SLUG_NAME = config.local_slug_name

/**
 * END: Things to move out to configuration
 */

const repo = argv._[0]
const gitRef = argv._[1]
const herokuApp = argv._[2]
const branch = argv.branch || null

// We'll overwrite this later if gitRef is branch/tag/etc
let commit = gitRef;

// create clients etc
const heroku = new Heroku({ token: HEROKU_TOKEN });

const destS3Conf = new AWS.Config(DEST_S3_CONF);
const destS3 = new AWS.S3(destS3Conf);


// dangerously clear up the workspace
console.log('clearing up any old workspace stuff')
rimraf.sync(WORKSPACE_DIR)

console.log('creating workspace')
fs.mkdirSync(WORKSPACE_DIR)

// clone the repository
console.log('cloning the repo')
const gitCloneArgs = ['clone', repo, '--depth', DEFAULT_GIT_CLONE_DEPTH]
if(branch) {
    gitCloneArgs.push('--branch', branch)
}
gitCloneArgs.push(SOURCE_DIR)
const cloneProc = spawnSync('git', gitCloneArgs, {cwd: process.cwd()})


// checkout the desired commit
console.log('checking out desired ref')
const gitCheckoutArgs = ['checkout', gitRef];
const checkoutProc = spawnSync('git', gitCheckoutArgs, {cwd: SOURCE_DIR})

//grab the actually commit ref
console.log('getting full commit hash')
const gitRevParseArgs = ['rev-parse', 'HEAD'];
const revParseProc = spawnSync('git', gitRevParseArgs, {cwd: SOURCE_DIR})

// TODO: probably error prone
commit = revParseProc.stdout.toString().trim()

if (gitRef !== commit) {
    console.log('converted git reference %s into %s', gitRef, commit)
}

// tarup the folder - heroku requires there be no containing folder in the tarball
console.log('tar-ing up into an archive')
const tarArgs = ['-zcf', DEFAULT_SOURCE_TARBALL_NAME, '-C', SOURCE_DIR,'--exclude', '.git', '.']
const tarProc = spawnSync('tar', tarArgs, {cwd: WORKSPACE_DIR})

//start all the heroku crap

//create source
const createSource = function(cb, res) {
    console.log('creating source')
    heroku.apps(herokuApp).sources().create(cb)
}

//upload tarball
const uploadSource = function(cb, res) {
    console.log('uploading source to ' + res.create_source.source_blob.put_url )
    const url = res.create_source.source_blob.put_url;
    request.put({url:url, body: fs.readFileSync(WORKSPACE_DIR+'/'+DEFAULT_SOURCE_TARBALL_NAME)}, function(err, httpResponse, body){
        cb(err)
    })
}

//start/create build
const createBuild = function(cb, res) {
    console.log('creating build')
    const attributes = {
        source_blob:{
            url: res.create_source.source_blob.get_url, 
            version: commit //we should git rev-parse instead incase someone uses short refs / tags
        }}
    heroku.apps(herokuApp).builds().create(attributes, cb);
}

const watchBuild = function(cb, res) {
    console.log('watching build ' + res.create_build.id)
    console.log('heroku build log: ' + res.create_build.output_stream_url )
    const build_id = res.create_build.id;

    // Pipe build output
    request.get(res.create_build.output_stream_url)
    .on('end', function(){
        check()
    }).on('error', function(){
        console.log('error whilst streaming build log')
        cb(err)
    }).pipe(process.stdout)

    function check(){
        heroku.apps(herokuApp).builds(build_id).info(function(err, result){
            if(err){
                //TODO: maybe some errors can be ignored and processing can continue
                return cb(err)
            }

            console.log('build status:' + result.status)

            if(result.status == 'failed') {
                return cb( new Error('build failed'))
            }

            if(result.status == 'succeeded') {
                return cb(null, result.slug)
            }

            cb(new Error('Build resolved to unexpected status %s', result.status))
        })
    }

}

const getSlug = function(cb, res){
    console.log('getting slug info')
    heroku.apps(herokuApp).slugs(res.watch_build.id).info(cb)
}

const downloadSlug = function(cb, res) {
    console.log('copying slug down from heroku S3');
    const tmpFileWriteStream = fs.createWriteStream(WORKSPACE_DIR+'/'+DEFAULT_TEMP_LOCAL_SLUG_NAME)

    request.get(res.get_slug.blob.url)
    .on('error', function(err){
        console.log(err, 'error downloading slug')
        cb(err)
    })
    .pipe(tmpFileWriteStream)
    .on('error', function(err){
        console.log(err, 'error writing slug to temp file')
        cb(err)
    })
    .on('end', function(){
        console.log('[END] finished downloading slug')
        cb()
    })
    .on('close', function(){
        console.log('[CLOSE] finished downloading slug')
        cb()
    })
}

const uploadSlug = function(cb, res){
    console.log('copying slug up to our S3');

    const tmpFileReadStream = fs.createReadStream(WORKSPACE_DIR+'/'+DEFAULT_TEMP_LOCAL_SLUG_NAME)
    const uploadPath = 'heroku-builds/' + herokuApp + '/' + commit + '.tar.gz';

    destS3.putObject({
        Bucket: DEST_S3_BUCKETNAME,
        Key: uploadPath,
        Body: tmpFileReadStream
    }, function(err, data){
        cb(err, uploadPath)
    })

}


const workplan = {
    create_source: createSource,
    upload_source: ['create_source', uploadSource],
    create_build: ['upload_source', createBuild],
    watch_build: ['create_build', watchBuild],
    get_slug: ['watch_build', getSlug],
    download_slug: ['get_slug', downloadSlug],
    upload_slug: ['download_slug', uploadSlug]
}

async.auto(workplan, function(err, res){
    if(err){
        console.log(err, 'problem during heroku build/upload phase')
        process.exit(1)
    }
    console.log('build completed')
    console.log('slug: ' + res.upload_slug)
})
