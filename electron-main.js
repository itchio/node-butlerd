'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./lib.production/electron-main.js');
} else {
  module.exports = require('./lib.development/electron-main.js');
}

