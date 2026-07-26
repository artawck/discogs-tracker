'use strict';

const path = require('path');
const Module = require('module');

// Workaround for a packaging bug in discogs-marketplace-api-nodejs@1.16.8:
// its published dist/ still contains unrewritten TypeScript path-alias
// requires (e.g. require("search"), require("scrapers/legacy.scraper"),
// require("data/country.data")) that don't resolve as plain npm bare
// specifiers. Adding the package's own dist/ directory to NODE_PATH lets
// Node's module resolution find them there, with no need to patch the
// installed package. Shared by every module that reaches into this
// package, so it only needs to run once (require() caches this module).
const pkgDist = path.join(path.dirname(require.resolve('discogs-marketplace-api-nodejs/package.json')), 'dist');
process.env.NODE_PATH = process.env.NODE_PATH ? `${process.env.NODE_PATH}${path.delimiter}${pkgDist}` : pkgDist;
Module._initPaths();
