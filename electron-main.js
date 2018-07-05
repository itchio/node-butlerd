'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./lib.production/electron.js');
} else {
  module.exports = require('./lib.development/electron.js');
}

