'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./lib.production/index.js');
} else {
  module.exports = require('./lib.development/index.js');
}
