#base-node

A simple and highly configurable base project for Typescript projects.


#The below text is from another project and needs to be reviewed for this project

Out-of-the-box support for:
  1. Packaging your application (including dependencies) into a single, compacted script file.
  2. Generating a minimal Docker container (<10MB download, <26MB expanded) so that your app can be deployed everywhere.


###Installation

````
$ curl https://raw.githubusercontent.com/blakelapierre/base-node/master/create.sh | bash -s your-project-name
````

The above command will create a new git repository named `your-project-name` in your current directory.

#####OR


````
$ git clone https://github.com/blakelapierre/base-node
$ cd base-node
$ npm install -g gulp-cli
$ npm install
````


###Building

````
$ gulp build
````

###Running

````
$ node .dist/index.js
````

Tests:
````
$ node .dist/tests/index.js
````

###Developing
This command will watch your source files for changes and run them through `jshint` and the transpiler when they change.

````
$ gulp watch
````

-----------
This command will do what `watch` does, but will also run your program after transpiling and will restart it after each transpile.

````
$ gulp dev
````


###Containerizing


````
$ gulp package
$ cd container
$ ./build.sh
$ ./publish.sh
````

First, run the `package` task to produce a single-file, minimized version of your app.

Then, go into the `container` folder to access the scripts to package your app into a Docker container. You should edit the `build.sh` and `publish.sh` scripts to use a container name that fits your project name.