# Ducktape-build-system

A script for creating/orchestrating builds via heroku's build system and copying the slugs across into our S3 buckets.

Calling this an alpha would be too kind.


## Usage

### Installation

either

`npm install -g ducktape-build-system`

_(yeah, I'm not very happy with that either but it will do for now)_

or

1. `git clone` this repo somewhere
2. `cd` into the newly created repo folder
3. `npm install`

(works on nodejs 4+ too)

### configuration
copy the example config and change/fill in the values

```
cp example.ducktape-cfg ~/somewhere/.ducktape-cfg 
```
The script needs S3 credentials for wherever it's going to store the slug and an Heroku token for using 
the heroku app

ducktape-build-system expects to find the `.ducktape-cfg` in your CWD when you run the script

### Running

`ducktape-build-system $ARGS`

Takes 3 args:

1. git repo to build from (you must have read access on whichever machine this is running on)
2. commit/ref/branch/tag to build
3. heroku app to use for the build

and one optional longopt

1. `--branch=<BRANCH>`: if trying to build a ref from a non-master/default branch you must specify this otherwise ducktape won't be able to find the reference.

_note to self: maybe we could something smart with `git ls-remote` to automate this_

e.g

```
ducktape-build-system "git@github.com:Bizzby/bizzby.git" "f96daa84613d3a6d1c73d2214fc948b711d9bd7b" bizzby-slugbuilder-test
## of if cloning the repo...
./bin/cli "git@github.com:Bizzby/bizzby.git" "f96daa84613d3a6d1c73d2214fc948b711d9bd7b" bizzby-slugbuilder-test
```



Example output
```
clearing up any old workspace stuff
cloning the repo
checking out desired ref
getting full commit hash
tar-ing up into an archive
creating source
uploading source to https://s3-external-1.amazonaws.com/heroku-sources-production/heroku.com/ef21ed18-f931-4341-929c-b8ef26ca2c62?AWSAccessKeyId=AKIAJURUZ6XB34ESX54A&Signature=dbTRsWJtYSIjwYDN9OEM3iBI4uk%3D&Expires=1449587344
creating build
watching build 07dbb7b0-adde-496e-a168-006c4cdaa431
heroku build log: https://build-output.heroku.com/streams/f5/f5130098-8065-4fc7-9633-5168d01787e3/logs/07/07dbb7b0-adde-496e-a168-006c4cdaa431.log?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAJQUUZPBDLMDG7K7Q%2F20151208%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20151208T140912Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=b14f2196f8f4ab72fcb17c70c0492f6f6aabac950ca690f49727a3771f8691ca
status:pending
status:pending
status:pending
status:pending
status:succeeded
getting slug info
copying slug down from heroku S3
[CLOSE] finished downloading slug
copying slug up to our S3
build completed
slug: heroku-builds/bizzby-slugbuilder-test/8444425d3f44114fddc2884a2dc75aa874aed630.tar.gz
```

Each run is stateless, but as there is no locking etc, running multiple builds at the some time in the same directory will cause a mess. However running multiple builds concurrently in different folders, or on different machines will probably be ok (although it may have some interesting effects on heroku's build cache).

The architecture of the machine this runs on is pretty irelevant although it's untested on windows. This script just orchestrates a bunch of HTTP calls and bounces some tarballs around.

If you don't install via `npm`, the script can be run from anywhere, not just where-ever you install this repo
e.g

```
node ../../blah/ducktape-build-system/index.js
```

## How it works

1. clean up any leftover folders from previous runs
1. The script clones the desired repo  (relative to your CWD), 
1. checks out the requested commit
1. finds the actual commit hash if a branch/tag/etc was used
1. creates a "source" on heroku
1. tarballs up the source code and pushes to the "source"
1. starts a build for the requested app using the "source"
1. polls the build status and once finished gets the slug location
1. copies the slug over to our S3 bucket {BUCKET}/heroku-builds/{heroku-app-name}/{commit}.tar.gz
1. leaves behind the build artifacts

## TODO:

- log output is very adhoc
- JS is not a nice language to do this in....
- relies on host machine for any git remote access authentication
- refactor functionality out from async wrappers
- allow for configuration (example.ducktap-config is where I'm currently at with that)
- use longopts rather than position parsing arg vectors
- better configuration for where the slug is sent to (path mostly)
- could turn this into a server and run on heroku (how meta)
- slack/SNS notifications
- tests
- full clones of the repo each time are network intensive, as is relaying tarballs down/up to S3