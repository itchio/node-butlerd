'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./lib.production/browser.js');
} else {
  module.exports = require('./lib.development/browser.js');
}

